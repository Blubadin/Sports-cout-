import type { ScoutProject } from "../types";
import {
  executeProjectWriteExclusively,
  type ExclusiveOperationExecutor,
} from "./projectWriteCoordinator";
import type { StorageAdapter } from "./storageAdapter";

export const PROJECTS_REPOSITORY_KEY = "scout-projects:v1.2";
export const PROJECTS_LEGACY_REPOSITORY_KEY = "scout-projects:v1.1";
export const PROJECTS_BACKUP_KEY = "scout-projects:legacy-backup";

export type ProjectRepositoryEnvelope = {
  schemaVersion: "1.2";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isPersistedMatchInfo = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.scouterName === "string" &&
  typeof value.nickname === "string" &&
  typeof value.matchName === "string" &&
  typeof value.matchType === "string" &&
  typeof value.setOrGame === "string" &&
  typeof value.currentPoint === "number" &&
  Number.isFinite(value.currentPoint) &&
  typeof value.sportType === "string";

/**
 * Persistence boundary for the required runtime project shape. This is
 * intentionally structural rather than exhaustive: optional metadata and
 * enum membership remain forwards-compatible, while fields loaded directly
 * into workspace state must have their expected container/primitive types.
 */
const isScoutProject = (value: unknown): value is ScoutProject =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.sportType === "string" &&
  isPersistedMatchInfo(value.matchInfo) &&
  Array.isArray(value.teams) &&
  Array.isArray(value.events) &&
  typeof value.createdAt === "string" &&
  typeof value.updatedAt === "string";

const normalizeProjects = (value: unknown): ScoutProject[] =>
  Array.isArray(value) ? value.filter(isScoutProject) : [];

const hasUniqueProjectIds = (projects: readonly ScoutProject[]): boolean =>
  new Set(projects.map(project => project.id)).size === projects.length;

const repairDuplicateProjectIds = (
  projects: readonly ScoutProject[],
): ScoutProject[] => {
  const reservedIds = new Set(projects.map(project => project.id));
  const assignedIds = new Set<string>();

  return projects.map(project => {
    if (!assignedIds.has(project.id)) {
      assignedIds.add(project.id);
      return project;
    }

    let suffix = 1;
    let repairedId = `${project.id}-${suffix}`;
    while (reservedIds.has(repairedId) || assignedIds.has(repairedId)) {
      suffix += 1;
      repairedId = `${project.id}-${suffix}`;
    }
    assignedIds.add(repairedId);
    return { ...project, id: repairedId };
  });
};

const isV12Envelope = (
  value: unknown,
): value is Partial<ProjectRepositoryEnvelope> & { projects: unknown[] } =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Partial<ProjectRepositoryEnvelope>).schemaVersion === "1.2" &&
      Array.isArray((value as Partial<ProjectRepositoryEnvelope>).projects) &&
      (value as Partial<ProjectRepositoryEnvelope>).projects!.every(
        isScoutProject,
      ) &&
      hasUniqueProjectIds(
        (value as Partial<ProjectRepositoryEnvelope>).projects as ScoutProject[],
      ),
  );

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
  schemaVersion: "1.2",
  revision,
  updatedAt: new Date().toISOString(),
  projects,
});

const assertUniqueProjectIds = (projects: ScoutProject[]) => {
  if (!hasUniqueProjectIds(projects)) {
    throw new Error("Project IDs must be unique before persistence");
  }
};

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
      if (isV12Envelope(stored)) {
        return {
          projects: normalizeProjects(stored.projects),
          revision: getRevision(stored),
        };
      }

      const storedProjects = normalizeProjects(stored);
      if (storedProjects.length > 0) {
        await adapter.setItem(PROJECTS_BACKUP_KEY, storedProjects);
        const repairedProjects = repairDuplicateProjectIds(storedProjects);
        const envelope = createEnvelope(repairedProjects);
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
        return { projects: repairedProjects, revision: envelope.revision };
      }

      const legacyStored = await adapter.getItem(PROJECTS_LEGACY_REPOSITORY_KEY);
      const legacyEnvelope =
        legacyStored &&
        typeof legacyStored === "object" &&
        !Array.isArray(legacyStored)
          ? (legacyStored as Partial<ProjectRepositoryEnvelope>)
          : null;
      const migratedProjects = normalizeProjects(
        legacyEnvelope ? legacyEnvelope.projects : legacyStored,
      );

      if (migratedProjects.length > 0) {
        const revision = getRevision(legacyEnvelope);
        await adapter.setItem(PROJECTS_BACKUP_KEY, migratedProjects);
        const repairedProjects = repairDuplicateProjectIds(migratedProjects);
        const envelope = createEnvelope(repairedProjects, revision);
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
        return { projects: repairedProjects, revision };
      }

      const safeLegacyProjects = normalizeProjects(legacyProjects);
      if (safeLegacyProjects.length > 0) {
        await adapter.setItem(PROJECTS_BACKUP_KEY, safeLegacyProjects);
      }
      const repairedProjects = repairDuplicateProjectIds(safeLegacyProjects);
      const envelope = createEnvelope(repairedProjects);
      await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
      return { projects: repairedProjects, revision: envelope.revision };
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

        const normalizedProjects = normalizeProjects(projects);
        assertUniqueProjectIds(normalizedProjects);
        const envelope = createEnvelope(
          normalizedProjects,
          currentRevision + 1,
        );
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
        return envelope;
      });
    },
  };
}
