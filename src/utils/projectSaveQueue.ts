export type ProjectSaveCallback<T> = () => T | Promise<T>;

export type ProjectSaveQueue = {
  enqueue<T>(callback: ProjectSaveCallback<T>): Promise<T>;
  /**
   * Waits for callbacks enqueued before this call. This is a snapshot, so
   * callers requiring a fully quiet queue must stop enqueuing before draining.
   */
  drain(): Promise<void>;
};

export function createProjectSaveQueue(): ProjectSaveQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(callback: ProjectSaveCallback<T>): Promise<T> {
      const result = tail.then(callback);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    drain() {
      // Capture the current tail; later enqueues intentionally are not included.
      return tail;
    },
  };
}
