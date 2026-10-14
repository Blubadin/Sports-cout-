const pendingSaves = new Set<() => Promise<void>>();

export function registerPilotSave(flush: () => Promise<void>): () => void {
  pendingSaves.add(flush);
  return () => { pendingSaves.delete(flush); };
}

/** Keep the authenticated workspace mounted until its pending writes are durable. */
export async function flushPilotWorkspace(): Promise<void> {
  await Promise.all(Array.from(pendingSaves, flush => flush()));
}
