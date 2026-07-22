export const PROJECT_SYNC_CHANNEL_NAME = "sportscout:project-sync:v1";
export const PROJECT_SYNC_STORAGE_KEY = "sportscout:project-sync:v1:message";
export const PROJECT_SYNC_MESSAGE_TYPE = "project-revision";

export type ProjectSyncMessage = {
  type: typeof PROJECT_SYNC_MESSAGE_TYPE;
  revision: number;
  timestamp: number;
  sourceId: string;
};

export type ProjectSyncListener = (message: ProjectSyncMessage) => void;

export type ProjectSyncChannel = {
  subscribe(listener: ProjectSyncListener): () => void;
  publish(revision: number): void;
  close(): void;
};

let fallbackSourceSequence = 0;

function createSourceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to an instance-local identifier without persisted identity.
  }

  fallbackSourceSequence += 1;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `${timestamp}-${fallbackSourceSequence.toString(36)}-${random}`;
}

function parseProjectSyncMessage(value: unknown): ProjectSyncMessage | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const expectedKeys = ["revision", "sourceId", "timestamp", "type"];
    const actualKeys = Object.keys(record).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      return undefined;
    }

    const { revision, sourceId, timestamp, type } = record;
    if (
      type !== PROJECT_SYNC_MESSAGE_TYPE ||
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      typeof timestamp !== "number" ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0 ||
      typeof sourceId !== "string" ||
      sourceId.length === 0 ||
      sourceId.length > 128
    ) {
      return undefined;
    }

    return {
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision,
      timestamp,
      sourceId,
    };
  } catch {
    return undefined;
  }
}

export function createProjectSyncChannel(): ProjectSyncChannel {
  const sourceId = createSourceId();
  const listeners = new Set<ProjectSyncListener>();
  let broadcastChannel: BroadcastChannel | undefined;
  let storageListenerAttached = false;
  let closed = false;

  const deliver = (value: unknown) => {
    if (closed) return;
    const message = parseProjectSyncMessage(value);
    if (!message || message.sourceId === sourceId) return;

    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // One subscriber cannot prevent notification of the remaining subscribers.
      }
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== PROJECT_SYNC_STORAGE_KEY || event.newValue === null) return;
    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage event data.
    }
  };

  let candidate: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      candidate = new BroadcastChannel(PROJECT_SYNC_CHANNEL_NAME);
      candidate.onmessage = (event: MessageEvent<unknown>) => deliver(event.data);
      broadcastChannel = candidate;
    }
  } catch {
    try {
      candidate?.close();
    } catch {
      // The storage transport remains available when cleanup also fails.
    }
  }

  try {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      storageListenerAttached = true;
    }
  } catch {
    // A blocked event transport leaves a no-op but usable channel.
  }

  const publishToStorage = (message: ProjectSyncMessage) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROJECT_SYNC_STORAGE_KEY,
          JSON.stringify(message),
        );
        window.localStorage.removeItem(PROJECT_SYNC_STORAGE_KEY);
      }
    } catch {
      // Storage may be disabled, full, or inaccessible in private contexts.
    }
  };

  return {
    subscribe(listener: ProjectSyncListener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(revision: number) {
      if (closed || !Number.isSafeInteger(revision) || revision < 0) return;
      const message: ProjectSyncMessage = {
        type: PROJECT_SYNC_MESSAGE_TYPE,
        revision,
        timestamp: Date.now(),
        sourceId,
      };

      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage(message);
          return;
        } catch {
          // Preserve the notification through the cross-transport fallback.
        }
      }

      publishToStorage(message);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();

      if (broadcastChannel) {
        try {
          broadcastChannel.onmessage = null;
        } catch {
          // Closing is best-effort and remains idempotent.
        }
        try {
          broadcastChannel.close();
        } catch {
          // Closing is best-effort and remains idempotent.
        }
      }

      if (storageListenerAttached) {
        try {
          window.removeEventListener("storage", onStorage);
        } catch {
          // Closing is best-effort and remains idempotent.
        }
      }
    },
  };
}
