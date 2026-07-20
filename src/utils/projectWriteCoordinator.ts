export const PROJECT_WRITE_LOCK_NAME = "scout-projects:write";

export type ExclusiveOperationExecutor = <T>(
  operation: () => Promise<T>,
) => Promise<T>;

export function createProjectWriteCoordinator(): ExclusiveOperationExecutor {
  const locks =
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
      ? navigator.locks
      : undefined;

  if (locks) {
    return <T>(operation: () => Promise<T>) =>
      locks.request(PROJECT_WRITE_LOCK_NAME, operation);
  }

  // This queue coordinates only callers in this JS instance, not separate tabs.
  let operationQueue: Promise<void> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export const executeProjectWriteExclusively =
  createProjectWriteCoordinator();
