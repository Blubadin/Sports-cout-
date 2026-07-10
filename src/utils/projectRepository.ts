import type { ScoutProject } from '../types';
import type { StorageAdapter } from './storageAdapter';

export const PROJECT_STORE_SCHEMA_VERSION = 2 as const;
export const PROJECT_STORE_INDEX_KEY = 'sports-scout:projects:index';
export const PROJECT_STORE_BACKUP_KEY = 'sports-scout:projects:backup:latest';

export type ProjectStoreIndex = {
  schemaVersion: typeof PROJECT_STORE_SCHEMA_VERSION;
  projectIds: string[];
  updatedAt: string;
};

export type ProjectRecoveryBackup = {
  id: string;
  schemaVersion: typeof PROJECT_STORE_SCHEMA_VERSION;
  reason: string;
  createdAt: string;
  projects: ScoutProject[];
};

export type ProjectRepository = {
  listProjects: () => Promise<ScoutProject[]>;
  getProject: (projectId: string) => Promise<ScoutProject | null>;
  saveProject: (project: ScoutProject) => Promise<void>;
  saveProjects: (projects: ScoutProject[]) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  createBackup: (projects: ScoutProject[], reason: string) => Promise<ProjectRecoveryBackup>;
  getLatestBackup: () => Promise<ProjectRecoveryBackup | null>;
};

export function getProjectStorageKey(projectId: string): string {
  return `sports-scout:projects:item:${encodeURIComponent(projectId)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isProjectStoreIndex(value: unknown): value is ProjectStoreIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as Partial<ProjectStoreIndex>;
  return index.schemaVersion === PROJECT_STORE_SCHEMA_VERSION
    && Array.isArray(index.projectIds)
    && index.projectIds.every((id) => typeof id === 'string')
    && typeof index.updatedAt === 'string';
}

function isRecoveryBackup(value: unknown): value is ProjectRecoveryBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Partial<ProjectRecoveryBackup>;
  return backup.schemaVersion === PROJECT_STORE_SCHEMA_VERSION
    && typeof backup.id === 'string'
    && typeof backup.reason === 'string'
    && typeof backup.createdAt === 'string'
    && Array.isArray(backup.projects);
}

export function createProjectRepository(adapter: StorageAdapter): ProjectRepository {
  const readIndex = async (): Promise<ProjectStoreIndex | null> => {
    const stored = await adapter.getItem(PROJECT_STORE_INDEX_KEY);
    if (stored === null) return null;
    if (!isProjectStoreIndex(stored)) {
      throw new Error('Project storage index is invalid or uses an unsupported schema version.');
    }
    return clone(stored);
  };

  const writeIndex = async (projectIds: string[]): Promise<void> => {
    const index: ProjectStoreIndex = {
      schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
      projectIds: [...new Set(projectIds)],
      updatedAt: new Date().toISOString(),
    };
    await adapter.setItem(PROJECT_STORE_INDEX_KEY, index);
  };

  const getProject = async (projectId: string): Promise<ScoutProject | null> => {
    const stored = await adapter.getItem(getProjectStorageKey(projectId));
    return stored === null ? null : clone(stored as ScoutProject);
  };

  return {
    async listProjects() {
      const index = await readIndex();
      if (!index) return [];
      const records = await Promise.all(index.projectIds.map((id) => getProject(id)));
      return records.filter((project): project is ScoutProject => project !== null);
    },

    getProject,

    async saveProject(project) {
      const index = await readIndex();
      await adapter.setItem(getProjectStorageKey(project.id), clone(project));
      const projectIds = index?.projectIds.includes(project.id)
        ? index.projectIds
        : [...(index?.projectIds || []), project.id];
      await writeIndex(projectIds);
    },

    async saveProjects(projects) {
      const previousIndex = await readIndex();
      const uniqueProjects = Array.from(new Map(projects.map((project) => [project.id, project])).values());
      await Promise.all(uniqueProjects.map((project) => (
        adapter.setItem(getProjectStorageKey(project.id), clone(project))
      )));

      const nextIds = uniqueProjects.map((project) => project.id);
      await writeIndex(nextIds);

      const nextIdSet = new Set(nextIds);
      const staleIds = (previousIndex?.projectIds || []).filter((id) => !nextIdSet.has(id));
      await Promise.all(staleIds.map((id) => adapter.removeItem(getProjectStorageKey(id))));
    },

    async deleteProject(projectId) {
      const index = await readIndex();
      if (!index) return;
      await writeIndex(index.projectIds.filter((id) => id !== projectId));
      await adapter.removeItem(getProjectStorageKey(projectId));
    },

    async createBackup(projects, reason) {
      const createdAt = new Date().toISOString();
      const backup: ProjectRecoveryBackup = {
        id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        schemaVersion: PROJECT_STORE_SCHEMA_VERSION,
        reason,
        createdAt,
        projects: clone(projects),
      };
      await adapter.setItem(PROJECT_STORE_BACKUP_KEY, backup);
      return clone(backup);
    },

    async getLatestBackup() {
      const stored = await adapter.getItem(PROJECT_STORE_BACKUP_KEY);
      if (stored === null) return null;
      if (!isRecoveryBackup(stored)) {
        throw new Error('Project recovery backup is invalid.');
      }
      return clone(stored);
    },
  };
}
