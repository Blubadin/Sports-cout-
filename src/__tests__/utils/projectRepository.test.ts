import { describe, expect, it } from "vitest";
import type { ScoutProject } from "../../types";
import type { StorageAdapter } from "../../utils/storageAdapter";
import {
  PROJECTS_BACKUP_KEY,
  PROJECTS_REPOSITORY_KEY,
  createProjectRepository,
} from "../../utils/projectRepository";
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
      schemaVersion: "1.1",
      projects: [legacyProject],
    });
  });

  it("prefers the IndexedDB envelope over stale localStorage data", async () => {
    const storedProject = createMockProject({ id: "stored-project" });
    const staleProject = createMockProject({ id: "stale-project" });
    const { adapter } = createMemoryAdapter({
      [PROJECTS_REPOSITORY_KEY]: {
        schemaVersion: "1.1",
        updatedAt: new Date().toISOString(),
        projects: [storedProject],
      },
    });

    const projects = await createProjectRepository(adapter).initialize([staleProject]);

    expect(projects.map((project) => project.id)).toEqual(["stored-project"]);
  });

  it("persists an updated versioned project envelope", async () => {
    const project = createMockProject({ id: "saved-project" });
    const { adapter, values } = createMemoryAdapter();
    const repository = createProjectRepository(adapter);

    await repository.save([project] as ScoutProject[]);

    expect(values.get(PROJECTS_REPOSITORY_KEY)).toMatchObject({
      schemaVersion: "1.1",
      projects: [project],
    });
  });
});
