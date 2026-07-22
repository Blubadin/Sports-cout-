import { describe, expect, it } from "vitest";
import { createProjectSaveQueue } from "../../utils/projectSaveQueue";

describe("projectSaveQueue", () => {
  it("starts queued callbacks in FIFO order after the prior save settles", async () => {
    const queue = createProjectSaveQueue();
    const order: string[] = [];
    let revision = 4;
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      order.push(`first:${revision}`);
      await firstReleased;
      revision = 5;
      order.push("first:done");
      return revision;
    });
    const second = queue.enqueue(async () => {
      order.push(`second:${revision}`);
      return revision;
    });

    await Promise.resolve();
    expect(order).toEqual(["first:4"]);

    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([5, 5]);
    expect(order).toEqual(["first:4", "first:done", "second:5"]);
  });

  it("continues after a queued callback rejects", async () => {
    const queue = createProjectSaveQueue();

    const failed = queue.enqueue(async () => {
      throw new Error("save failed");
    });
    const recovered = queue.enqueue(async () => "saved");

    await expect(failed).rejects.toThrow("save failed");
    await expect(recovered).resolves.toBe("saved");
  });

  it("continues after a queued callback throws synchronously", async () => {
    const queue = createProjectSaveQueue();

    const failed = queue.enqueue(() => {
      throw new Error("synchronous save failure");
    });
    const recovered = queue.enqueue(() => "saved");

    await expect(failed).rejects.toThrow("synchronous save failure");
    await expect(recovered).resolves.toBe("saved");
  });

  it("drains all queued callbacks without inheriting their rejection", async () => {
    const queue = createProjectSaveQueue();
    let releaseLast: (() => void) | undefined;
    const lastReleased = new Promise<void>((resolve) => {
      releaseLast = resolve;
    });

    const failed = queue.enqueue(async () => {
      throw new Error("save failed");
    });
    void failed.catch(() => undefined);
    queue.enqueue(async () => {
      await lastReleased;
    });

    let drained = false;
    const drain = queue.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseLast?.();
    await expect(drain).resolves.toBeUndefined();
    expect(drained).toBe(true);
  });

  it("drain snapshots callbacks queued before it is called", async () => {
    const queue = createProjectSaveQueue();
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let releaseLater: (() => void) | undefined;
    const laterReleased = new Promise<void>((resolve) => {
      releaseLater = resolve;
    });

    queue.enqueue(() => firstReleased);
    const drain = queue.drain();
    const later = queue.enqueue(() => laterReleased);

    releaseFirst?.();
    await expect(drain).resolves.toBeUndefined();

    let laterSettled = false;
    void later.then(() => {
      laterSettled = true;
    });
    await Promise.resolve();
    expect(laterSettled).toBe(false);

    releaseLater?.();
    await expect(later).resolves.toBeUndefined();
  });
});
