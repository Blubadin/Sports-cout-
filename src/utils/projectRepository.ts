import type { ScoutProject } from "../types";
import {
  executeProjectWriteExclusively,
  type ExclusiveOperationExecutor,
} from "./projectWriteCoordinator";
import type { StorageAdapter } from "./storageAdapter";

export const PROJECTS_REPOSITORY_KEY = "scout-projects:v1.1";
export const PROJECTS_BACKUP_KEY = "scout-projects:legacy-backup";

export type ProjectRepositoryEnvelope = {
  schemaVersion: "1.1";
  revision?: number;
  updatedAt: string;
  projects: ScoutProject[];
};

export type SavedProjectRepositoryEnvelope = ProjectRepositoryEnvelope & {
  revision: number;
};

export type ProjectRepositoryState = {
  projects: ScoutProject[];
  revision: number;
};

export class ProjectRepositoryConflictError extends Error {
  readonly name = "ProjectRepositoryConflictError";

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(
      `Project repository revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
  }
}

const isScoutProject = (value: unknown): value is ScoutProject => {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ScoutProject>;
  return Boolean(
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    Array.isArray(project.events),
  );
};

const normalizeProjects = (value: unknown): ScoutProject[] =>
  Array.isArray(value) ? value.filter(isScoutProject) : [];

const getRevision = (value: unknown): number => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const revision = (value as Partial<ProjectRepositoryEnvelope>).revision;
  return typeof revision === "number" &&
    Number.isSafeInteger(revision) &&
    revision >= 0
    ? revision
    : 0;
};

const createEnvelope = (
  projects: ScoutProject[],
  revision = 0,
): SavedProjectRepositoryEnvelope => ({
  schemaVersion: "1.1",
  revision,
  updatedAt: new Date().toISOString(),
  projects,
});

export function createProjectRepository(
  adapter: StorageAdapter,
  executeExclusively: ExclusiveOperationExecutor =
    executeProjectWriteExclusively,
) {
  const initializeWithRevision = (
    legacyProjects: ScoutProject[],
  ): Promise<ProjectRepositoryState> =>
    executeExclusively(async () => {
      const stored = await adapter.getItem(PROJECTS_REPOSITORY_KEY);
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const envelope = stored as Partial<ProjectRepositoryEnvelope>;
        if (Array.isArray(envelope.projects)) {
          return {
            projects: normalizeProjects(envelope.projects),
            revision: getRevision(envelope),
          };
        }
      }

      const storedProjects = normalizeProjects(stored);
      if (storedProjects.length > 0) {
        const envelope = createEnvelope(storedProjects);
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
        return { projects: storedProjects, revision: envelope.revision };
      }

      const safeLegacyProjects = normalizeProjects(legacyProjects);
      if (safeLegacyProjects.length > 0) {
        await adapter.setItem(PROJECTS_BACKUP_KEY, safeLegacyProjects);
      }
      const envelope = createEnvelope(safeLegacyProjects);
      await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
      return { projects: safeLegacyProjects, revision: envelope.revision };
    });

  return {
    async initialize(legacyProjects: ScoutProject[]): Promise<ScoutProject[]> {
      const state = await initializeWithRevision(legacyProjects);
      return state.projects;
    },

    initializeWithRevision,

    async save(
      projects: ScoutProject[],
      expectedRevision?: number,
    ): Promise<SavedProjectRepositoryEnvelope> {
      return executeExclusively(async () => {
        const stored = await adapter.getItem(PROJECTS_REPOSITORY_KEY);
        const currentRevision = getRevision(stored);

        if (
          expectedRevision !== undefined &&
          expectedRevision !== currentRevision
        ) {
          throw new ProjectRepositoryConflictError(
            expectedRevision,
            currentRevision,
          );
        }

        const envelope = createEnvelope(
          normalizeProjects(projects),
          currentRevision + 1,
        );
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
        return envelope;
      });
    },
  };
}
