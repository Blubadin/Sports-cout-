import { describe, expect, it } from 'vitest';
import type { ScoutProject } from '../../types';
import type { StorageAdapter } from '../../utils/storageAdapter';
import {
  PROJECT_STORE_INDEX_KEY,
  PROJECT_STORE_SCHEMA_VERSION,
  createProjectRepository,
  getProjectStorageKey,
} from '../../utils/projectRepository';

function createMemoryAdapter(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  const adapter: StorageAdapter = {
    async getItem(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async setItem(key, value) {
      values.set(key, structuredClone(value));
    },
    async removeItem(key) {
      values.delete(key);
    },
  };

  return { adapter, values };
}

function createProject(id: string, title = `Project ${id}`): ScoutProject {
  return {
    id,
    title,
    sportType: 'volleyball',
    matchInfo: {
      scouterName: '',
      nickname: '',
      matchName: title,
      matchType: 'Team',
      setOrGame: '1',
      currentPoint: 1,
      sportType: 'volleyball',
    },
    teams: [],
    events: [],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

describe('projectRepository', () => {
  it('stores projects as separate records behind a versioned index', async () => {
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);

    await repository.saveProject(createProject('p1'));
    await repository.saveProject(createProject('p2'));

    expect(values.get(PROJECT_STORE_INDEX_KEY)).toMatchObject({
      schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
      projectIds: ['p1', 'p2'],
    });
    expect(values.get(getProjectStorageKey('p1'))).toMatchObject({ id: 'p1' });
    expect(values.get(getProjectStorageKey('p2'))).toMatchObject({ id: 'p2' });
  });

  it('returns cloned project data so callers cannot mutate persisted records', async () => {
    const { adapter } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);
    await repository.saveProject(createProject('p1'));

    const firstRead = await repository.getProject('p1');
    expect(firstRead).not.toBeNull();
    firstRead!.title = 'Mutated in memory';

    const secondRead = await repository.getProject('p1');
    expect(secondRead?.title).toBe('Project p1');
  });

  it('deletes the project record and removes its id from the index', async () => {
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);
    await repository.saveProjects([createProject('p1'), createProject('p2')]);

    await repository.deleteProject('p1');

    expect(values.has(getProjectStorageKey('p1'))).toBe(false);
    expect(await repository.listProjects()).toEqual([createProject('p2')]);
  });

  it('replaces stale records when saving a complete project collection', async () => {
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);
    await repository.saveProjects([createProject('old'), createProject('keep')]);

    await repository.saveProjects([createProject('keep', 'Updated')]);

    expect(values.has(getProjectStorageKey('old'))).toBe(false);
    expect(await repository.listProjects()).toEqual([createProject('keep', 'Updated')]);
  });

  it('creates and reads a recoverable backup without changing project records', async () => {
    const { adapter } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);
    const projects = [createProject('p1')];
    await repository.saveProjects(projects);

    const backup = await repository.createBackup(projects, 'before-migration');
    const recovered = await repository.getLatestBackup();

    expect(backup).toMatchObject({
      schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
      reason: 'before-migration',
      projects,
    });
    expect(recovered).toEqual(backup);
    expect(await repository.listProjects()).toEqual(projects);
  });
});
