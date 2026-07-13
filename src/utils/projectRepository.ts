import type { ScoutProject } from "../types";
import type { StorageAdapter } from "./storageAdapter";

export const PROJECTS_REPOSITORY_KEY = "scout-projects:v1.1";
export const PROJECTS_BACKUP_KEY = "scout-projects:legacy-backup";

export type ProjectRepositoryEnvelope = {
  schemaVersion: "1.1";
  updatedAt: string;
  projects: ScoutProject[];
};

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

const createEnvelope = (projects: ScoutProject[]): ProjectRepositoryEnvelope => ({
  schemaVersion: "1.1",
  updatedAt: new Date().toISOString(),
  projects,
});

export function createProjectRepository(adapter: StorageAdapter) {
  return {
    async initialize(legacyProjects: ScoutProject[]): Promise<ScoutProject[]> {
      const stored = await adapter.getItem(PROJECTS_REPOSITORY_KEY);
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const envelope = stored as Partial<ProjectRepositoryEnvelope>;
        if (Array.isArray(envelope.projects)) {
          return normalizeProjects(envelope.projects);
        }
      }

      const storedProjects = normalizeProjects(stored);
      if (storedProjects.length > 0) {
        await adapter.setItem(PROJECTS_REPOSITORY_KEY, createEnvelope(storedProjects));
        return storedProjects;
      }

      const safeLegacyProjects = normalizeProjects(legacyProjects);
      if (safeLegacyProjects.length > 0) {
        await adapter.setItem(PROJECTS_BACKUP_KEY, safeLegacyProjects);
      }
      await adapter.setItem(PROJECTS_REPOSITORY_KEY, createEnvelope(safeLegacyProjects));
      return safeLegacyProjects;
    },

    async save(projects: ScoutProject[]): Promise<void> {
      await adapter.setItem(
        PROJECTS_REPOSITORY_KEY,
        createEnvelope(normalizeProjects(projects)),
      );
    },
  };
}
