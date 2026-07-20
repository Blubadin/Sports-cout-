import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_WRITE_LOCK_NAME,
  createProjectWriteCoordinator,
} from "../../utils/projectWriteCoordinator";

describe("projectWriteCoordinator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the stable project write Web Lock when available", async () => {
    const request = vi.fn(
      async (_name: string, operation: () => Promise<string>) => operation(),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const executeExclusively = createProjectWriteCoordinator();

    await expect(executeExclusively(async () => "saved")).resolves.toBe(
      "saved",
    );

    expect(request).toHaveBeenCalledWith(
      PROJECT_WRITE_LOCK_NAME,
      expect.any(Function),
    );
  });

  it("runs the in-process fallback in FIFO order", async () => {
    vi.stubGlobal("navigator", {});
    const executeExclusively = createProjectWriteCoordinator();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = executeExclusively(async () => {
      order.push("first:start");
      markFirstStarted?.();
      await firstReleased;
      order.push("first:end");
      return "first";
    });
    const second = executeExclusively(async () => {
      order.push("second");
      return "second";
    });

    await firstStarted;
    expect(order).toEqual(["first:start"]);

    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues the fallback queue after an operation rejects", async () => {
    vi.stubGlobal("navigator", {});
    const executeExclusively = createProjectWriteCoordinator();
    const order: string[] = [];

    const failed = executeExclusively(async () => {
      order.push("failed");
      throw new Error("write failed");
    });
    const recovered = executeExclusively(async () => {
      order.push("recovered");
      return "saved";
    });

    await expect(failed).rejects.toThrow("write failed");
    await expect(recovered).resolves.toBe("saved");
    expect(order).toEqual(["failed", "recovered"]);
  });
});
