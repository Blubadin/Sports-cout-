import { describe, expect, it } from "vitest";
import type { ScoutProject } from "../../types";
import type { StorageAdapter } from "../../utils/storageAdapter";
import {
  PROJECTS_BACKUP_KEY,
  PROJECTS_REPOSITORY_KEY,
  ProjectRepositoryConflictError,
  createProjectRepository,
} from "../../utils/projectRepository";
import { createProjectWriteCoordinator } from "../../utils/projectWriteCoordinator";
import { createMockEvent, mockTeams } from "../fixtures";

function createMockProject(overrides: Partial<ScoutProject> = {}): ScoutProject {
  return {
    id: "project-1",
    title: "Test project",
    sportType: "volleyball",
    matchInfo: {
      scouterName: "Tester",
      nickname: "QA",
      matchName: "Test match",
      matchType: "Team",
      setOrGame: "1",
      currentPoint: 1,
      sportType: "volleyball",
    },
    teams: mockTeams,
    events: [createMockEvent()],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createMemoryAdapter(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const adapter: StorageAdapter = {
    async getItem(key) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return { adapter, values };
}

describe("projectRepository", () => {
  it("migrates legacy projects once and preserves a recovery backup", async () => {
    const legacyProject = createMockProject({ id: "legacy-project" });
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);

    const projects = await repository.initialize([legacyProject]);

    expect(projects).toEqual([legacyProject]);
    expect(values.get(PROJECTS_BACKUP_KEY)).toEqual([legacyProject]);
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toMatchObject({
      schemaVersion: "1.2",
      projects: [legacyProject],
    });
  });

  it("prefers the IndexedDB envelope over stale localStorage data", async () => {
    const storedProject = createMockProject({ id: "stored-project" });
    const staleProject = createMockProject({ id: "stale-project" });
    const { adapter } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: {
        schemaVersion: "1.2",
        updatedAt: new Date().toISOString(),
        projects: [storedProject],
      },
    });

    const projects = await createProjectRepository(adapter).initialize([staleProject]);

    expect(projects.map((project) => project.id)).toEqual(["stored-project"]);
  });

  it("reports revision zero when initializing from a legacy envelope", async () => {
    const storedProject = createMockProject({ id: "stored-project" });
    const storedEnvelope = {
      schemaVersion: "1.2",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [storedProject],
    };
    const { adapter, values } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: storedEnvelope,
    });

    const state = await createProjectRepository(adapter).initializeWithRevision(
      [],
    );

    expect(state).toEqual({ projects: [storedProject], revision: 0 });
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toBe(storedEnvelope);
  });

  it("preserves the stored revision when initializing repository state", async () => {
    const storedProject = createMockProject({ id: "stored-project" });
    const storedEnvelope = {
      schemaVersion: "1.2",
      revision: 7,
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [storedProject],
    };
    const { adapter, values } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: storedEnvelope,
    });

    const state = await createProjectRepository(adapter).initializeWithRevision(
      [],
    );

    expect(state).toEqual({ projects: [storedProject], revision: 7 });
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toBe(storedEnvelope);
  });

  it("persists an updated versioned project envelope", async () => {
    const project = createMockProject({ id: "saved-project" });
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);

    const saved = await repository.save([project] as ScoutProject[]);

    expect(values.get(PROJECTS_REPOSITORY_KEY)).toMatchObject({
      schemaVersion: "1.2",
      revision: 1,
      projects: [project],
    });
    expect(saved).toEqual(values.get(PROJECTS_REPOSITORY_KEY));
  });

  it("treats an envelope without a revision as revision zero", async () => {
    const existingProject = createMockProject({ id: "existing-project" });
    const nextProject = createMockProject({ id: "next-project" });
    const { adapter } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: {
        schemaVersion: "1.2",
        updatedAt: "2026-01-01T00:00:00.000Z",
        projects: [existingProject],
      },
    });

    const saved = await createProjectRepository(adapter).save([nextProject], 0);

    expect(saved.revision).toBe(1);
    expect(saved.projects).toEqual([nextProject]);
  });

  it("rejects a stale expected revision without changing stored projects", async () => {
    const storedProject = createMockProject({ id: "stored-project" });
    const staleProject = createMockProject({ id: "stale-project" });
    const storedEnvelope = {
      schemaVersion: "1.2",
      revision: 3,
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [storedProject],
    };
    const { adapter, values } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: storedEnvelope,
    });
    const repository = createProjectRepository(adapter);

    const save = repository.save([staleProject], 2);

    await expect(save).rejects.toBeInstanceOf(ProjectRepositoryConflictError);
    await expect(save).rejects.toMatchObject({
      expectedRevision: 2,
      currentRevision: 3,
    });
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toBe(storedEnvelope);
  });

  it("serializes saves so a delayed older write finishes before a newer write", async () => {
    const values = new Map<string, unknown>();
    const writes: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let markFirstWriteStarted: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const adapter: StorageAdapter = {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        const projectId = (value as { projects: ScoutProject[] }).projects[0]?.id;
        writes.push(projectId);
        if (writes.length === 1) {
          markFirstWriteStarted?.();
          await firstWriteReleased;
        }
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    };
    const repository = createProjectRepository(adapter);

    const olderSave = repository.save([createMockProject({ id: "older" })]);
    await firstWriteStarted;
    const newerSave = repository.save([createMockProject({ id: "newer" })]);

    await Promise.resolve();
    expect(writes).toEqual(["older"]);

    releaseFirstWrite?.();
    const [olderEnvelope, newerEnvelope] = await Promise.all([
      olderSave,
      newerSave,
    ]);

    expect(writes).toEqual(["older", "newer"]);
    expect(olderEnvelope.revision).toBe(1);
    expect(newerEnvelope.revision).toBe(2);
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toMatchObject({
      revision: 2,
      projects: [{ id: "newer" }],
    });
  });

  it("allows a later save after an earlier queued write fails", async () => {
    const values = new Map<string, unknown>();
    let shouldFail = true;
    const adapter: StorageAdapter = {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("storage unavailable");
        }
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    };
    const repository = createProjectRepository(adapter);

    const failedSave = repository.save([createMockProject({ id: "failed" })]);
    const recoveredSave = repository.save([
      createMockProject({ id: "recovered" }),
    ]);

    await expect(failedSave).rejects.toThrow("storage unavailable");
    await expect(recoveredSave).resolves.toMatchObject({
      revision: 1,
      projects: [{ id: "recovered" }],
    });
  });

  it("allows exactly one repository to save a shared expected revision", async () => {
    const { adapter, values } = createMemoryAdapter();
    const executeExclusively = createProjectWriteCoordinator();
    const firstRepository = createProjectRepository(
      adapter,
      executeExclusively,
    );
    const secondRepository = createProjectRepository(
      adapter,
      executeExclusively,
    );

    const [firstResult, secondResult] = await Promise.allSettled([
      firstRepository.save([createMockProject({ id: "first" })], 0),
      secondRepository.save([createMockProject({ id: "second" })], 0),
    ]);

    expect(firstResult.status).toBe("fulfilled");
    expect(secondResult.status).toBe("rejected");
    if (firstResult.status !== "fulfilled") {
      throw new Error("Expected the first save to win the FIFO lock");
    }
    if (secondResult.status !== "rejected") {
      throw new Error("Expected the second save to detect a conflict");
    }
    expect(secondResult.reason).toBeInstanceOf(ProjectRepositoryConflictError);
    expect(values.get(PROJECTS_REPOSITORY_KEY)).toEqual(firstResult.value);
  });
});
