import type { ScoutProject } from "../types";
import {
  ProjectRepositoryConflictError,
  type ProjectRepositoryState,
  type SavedProjectRepositoryEnvelope,
} from "./projectRepository";
import {
  createProjectSaveQueue,
  type ProjectSaveQueue,
} from "./projectSaveQueue";
import {
  createProjectSyncChannel,
  type ProjectSyncChannel,
  type ProjectSyncMessage,
} from "./projectSyncChannel";

const MAX_SAVE_ATTEMPTS = 3;
const TRANSIENT_INDEXED_DB_ERROR_NAMES = new Set([
  "AbortError",
  "UnknownError",
]);

export type ProjectPersistenceRepository = {
  initializeWithRevision(
    legacyProjects: ScoutProject[],
  ): Promise<ProjectRepositoryState>;
  save(
    projects: ScoutProject[],
    expectedRevision?: number,
  ): Promise<SavedProjectRepositoryEnvelope>;
};

export type ProjectPersistenceWait = (
  retryAttempt: number,
  error: unknown,
) => void | Promise<void>;

export type ProjectPersistenceConflictListener = (
  conflict: ProjectRepositoryConflictError,
) => void;

export type ProjectPersistenceSessionOptions = {
  repository: ProjectPersistenceRepository;
  saveQueue?: ProjectSaveQueue;
  syncChannel?: ProjectSyncChannel;
  wait?: ProjectPersistenceWait;
  onConflict?: ProjectPersistenceConflictListener;
};

export type ProjectPersistenceSession = {
  initializeWithRevision(
    legacyProjects: ScoutProject[],
  ): Promise<ProjectRepositoryState>;
  save(projects: ScoutProject[]): Promise<SavedProjectRepositoryEnvelope>;
  drain(): Promise<void>;
  getCurrentRevision(): number | undefined;
  getExternalRevision(): number | undefined;
  close(): void;
};

const defaultWait: ProjectPersistenceWait = (retryAttempt) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, retryAttempt * 100);
  });

function isTransientIndexedDbError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    TRANSIENT_INDEXED_DB_ERROR_NAMES.has(error.name)
  );
}

export function createProjectPersistenceSession({
  repository,
  saveQueue = createProjectSaveQueue(),
  syncChannel = createProjectSyncChannel(),
  wait = defaultWait,
  onConflict,
}: ProjectPersistenceSessionOptions): ProjectPersistenceSession {
  let currentRevision: number | undefined;
  let externalRevision: number | undefined;
  let lastNotifiedExternalRevision: number | undefined;
  let closed = false;

  const notifyConflict = (conflict: ProjectRepositoryConflictError) => {
    if (
      lastNotifiedExternalRevision !== undefined &&
      conflict.currentRevision <= lastNotifiedExternalRevision
    ) {
      return;
    }
    lastNotifiedExternalRevision = conflict.currentRevision;

    try {
      onConflict?.(conflict);
    } catch {
      // Observer failures cannot change persistence conflict handling.
    }
  };

  const markConflict = (conflict: ProjectRepositoryConflictError) => {
    if (
      externalRevision === undefined ||
      conflict.currentRevision > externalRevision
    ) {
      externalRevision = conflict.currentRevision;
    }
    notifyConflict(conflict);
  };

  const handleExternalRevision = (message: ProjectSyncMessage) => {
    const comparisonRevision = externalRevision ?? currentRevision;
    if (
      comparisonRevision !== undefined &&
      message.revision <= comparisonRevision
    ) {
      return;
    }

    externalRevision = message.revision;
    if (currentRevision !== undefined && message.revision > currentRevision) {
      notifyConflict(
        new ProjectRepositoryConflictError(
          currentRevision,
          message.revision,
        ),
      );
    }
  };

  const unsubscribe = syncChannel.subscribe(handleExternalRevision);

  const enqueueWhileOpen = <T>(callback: () => Promise<T>): Promise<T> => {
    if (closed) {
      return Promise.reject(
        new Error("Project persistence session is closed"),
      );
    }
    return saveQueue.enqueue(callback);
  };

  const getBlockingConflict = () => {
    if (
      currentRevision === undefined ||
      externalRevision === undefined ||
      externalRevision <= currentRevision
    ) {
      return undefined;
    }
    return new ProjectRepositoryConflictError(
      currentRevision,
      externalRevision,
    );
  };

  return {
    initializeWithRevision(legacyProjects) {
      return enqueueWhileOpen(async () => {
        const state = await repository.initializeWithRevision(legacyProjects);
        currentRevision = state.revision;

        if (
          externalRevision !== undefined &&
          externalRevision <= currentRevision
        ) {
          externalRevision = undefined;
        } else {
          const conflict = getBlockingConflict();
          if (conflict) notifyConflict(conflict);
        }

        return state;
      });
    },

    save(projects) {
      return enqueueWhileOpen(async () => {
        if (currentRevision === undefined) {
          throw new Error("Project persistence session is not initialized");
        }

        const blockingConflict = getBlockingConflict();
        if (blockingConflict) throw blockingConflict;
        const expectedRevision = currentRevision;

        for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
          try {
            const envelope = await repository.save(
              projects,
              expectedRevision,
            );
            currentRevision = envelope.revision;
            if (
              externalRevision !== undefined &&
              externalRevision <= currentRevision
            ) {
              externalRevision = undefined;
            }
            syncChannel.publish(envelope.revision);
            return envelope;
          } catch (error) {
            if (error instanceof ProjectRepositoryConflictError) {
              markConflict(error);
              throw error;
            }
            if (
              attempt === MAX_SAVE_ATTEMPTS ||
              !isTransientIndexedDbError(error)
            ) {
              throw error;
            }

            await wait(attempt, error);
            const retryConflict = getBlockingConflict();
            if (retryConflict) throw retryConflict;
          }
        }

        throw new Error("Project save retry limit reached");
      });
    },

    drain: () => saveQueue.drain(),
    getCurrentRevision: () => currentRevision,
    getExternalRevision: () => externalRevision,

    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      syncChannel.close();
    },
  };
}
