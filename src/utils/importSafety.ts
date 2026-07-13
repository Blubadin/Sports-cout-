export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_PROJECTS = 100;
export const MAX_IMPORT_EVENTS = 20_000;

export const validateImportFileSize = (fileSize: number) =>
  Number.isFinite(fileSize) && fileSize >= 0 && fileSize <= MAX_IMPORT_FILE_BYTES;

export function getImportPayloadCounts(payload: unknown): { projects: number; events: number } {
  if (Array.isArray(payload)) {
    const looksLikeProjects = payload.some(item =>
      Boolean(item && typeof item === "object" && Array.isArray((item as { events?: unknown }).events)),
    );
    if (looksLikeProjects) {
      return {
        projects: payload.length,
        events: payload.reduce((total, item) =>
          total + (Array.isArray((item as { events?: unknown[] })?.events) ? (item as { events: unknown[] }).events.length : 0), 0),
      };
    }
    return { projects: 1, events: payload.length };
  }

  if (!payload || typeof payload !== "object") return { projects: 0, events: 0 };
  const value = payload as {
    type?: string;
    projects?: unknown[];
    events?: unknown[];
    indexedDbProjects?: { projects?: unknown[] };
  };
  if (Array.isArray(value.projects)) return getImportPayloadCounts(value.projects);
  if (Array.isArray(value.indexedDbProjects?.projects)) {
    return getImportPayloadCounts(value.indexedDbProjects.projects);
  }
  if (Array.isArray(value.events)) return { projects: 1, events: value.events.length };
  return { projects: 0, events: 0 };
}
