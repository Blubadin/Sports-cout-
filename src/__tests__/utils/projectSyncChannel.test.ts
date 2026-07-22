import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_SYNC_CHANNEL_NAME,
  PROJECT_SYNC_MESSAGE_TYPE,
  PROJECT_SYNC_STORAGE_KEY,
  createProjectSyncChannel,
  type ProjectSyncChannel,
  type ProjectSyncMessage,
} from "../../utils/projectSyncChannel";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  readonly name: string;
  readonly posted: unknown[] = [];
  closed = false;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  close() {
    this.closed = true;
  }

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

const openChannels: ProjectSyncChannel[] = [];

function openProjectSyncChannel(): ProjectSyncChannel {
  const channel = createProjectSyncChannel();
  openChannels.push(channel);
  return channel;
}

describe("projectSyncChannel", () => {
  afterEach(() => {
    openChannels.splice(0).forEach((channel) => channel.close());
    FakeBroadcastChannel.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses BroadcastChannel and publishes only revision metadata", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const first = openProjectSyncChannel();
    const second = openProjectSyncChannel();

    first.publish(7);
    second.publish(8);

    expect(FakeBroadcastChannel.instances).toHaveLength(2);
    expect(FakeBroadcastChannel.instances[0].name).toBe(
      PROJECT_SYNC_CHANNEL_NAME,
    );
    const firstMessage = FakeBroadcastChannel.instances[0]
      .posted[0] as ProjectSyncMessage;
    const secondMessage = FakeBroadcastChannel.instances[1]
      .posted[0] as ProjectSyncMessage;
    expect(firstMessage).toEqual({
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 7,
      timestamp: expect.any(Number),
      sourceId: expect.any(String),
    });
    expect(Object.keys(firstMessage).sort()).toEqual([
      "revision",
      "sourceId",
      "timestamp",
      "type",
    ]);
    expect(firstMessage.sourceId).not.toBe(secondMessage.sourceId);
  });

  it("delivers only valid external messages", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = openProjectSyncChannel();
    const listener = vi.fn();
    channel.subscribe(listener);
    channel.publish(3);
    const transport = FakeBroadcastChannel.instances[0];
    const ownMessage = transport.posted[0] as ProjectSyncMessage;

    transport.emit(ownMessage);
    transport.emit(null);
    transport.emit({ ...ownMessage, revision: -1, sourceId: "external" });
    transport.emit({ ...ownMessage, sourceId: "external", project: {} });
    transport.emit({
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 4,
      timestamp: ownMessage.timestamp + 1,
      sourceId: "external-source",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 4,
      timestamp: ownMessage.timestamp + 1,
      sourceId: "external-source",
    });
  });

  it("falls back to storage events when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    let storedValue: string | null = null;
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation((key, value) => {
        if (key === PROJECT_SYNC_STORAGE_KEY) storedValue = value;
      });
    const removeItem = vi
      .spyOn(window.localStorage, "removeItem")
      .mockImplementation(() => undefined);
    const channel = openProjectSyncChannel();
    const listener = vi.fn();
    channel.subscribe(listener);

    channel.publish(11);

    expect(setItem).toHaveBeenCalledWith(
      PROJECT_SYNC_STORAGE_KEY,
      expect.any(String),
    );
    expect(removeItem).toHaveBeenCalledWith(PROJECT_SYNC_STORAGE_KEY);
    const ownMessage = JSON.parse(storedValue ?? "null") as ProjectSyncMessage;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PROJECT_SYNC_STORAGE_KEY,
        newValue: JSON.stringify({ ...ownMessage, sourceId: "other-tab" }),
      }),
    );

    expect(listener).toHaveBeenCalledWith({
      ...ownMessage,
      sourceId: "other-tab",
    });
  });

  it("falls back to metadata-only storage delivery when BroadcastChannel posting fails", () => {
    class ThrowingPostBroadcastChannel extends FakeBroadcastChannel {
      readonly attempted: unknown[] = [];

      override postMessage(message: unknown) {
        this.attempted.push(message);
        throw new Error("post failed");
      }
    }
    vi.stubGlobal("BroadcastChannel", ThrowingPostBroadcastChannel);
    const storedValues: string[] = [];
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === PROJECT_SYNC_STORAGE_KEY) storedValues.push(value);
    });
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(
      () => undefined,
    );
    const sender = openProjectSyncChannel();
    const receiver = openProjectSyncChannel();
    const listener = vi.fn();
    receiver.subscribe(listener);

    sender.publish(12);

    expect(storedValues).toHaveLength(1);
    const payload = JSON.parse(storedValues[0]) as ProjectSyncMessage;
    expect(payload).toEqual({
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 12,
      timestamp: expect.any(Number),
      sourceId: expect.any(String),
    });
    expect(Object.keys(payload).sort()).toEqual([
      "revision",
      "sourceId",
      "timestamp",
      "type",
    ]);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PROJECT_SYNC_STORAGE_KEY,
        newValue: storedValues[0],
      }),
    );
    expect(listener).toHaveBeenCalledWith(payload);

    sender.publish(13);
    expect(storedValues).toHaveLength(2);
    expect(
      (FakeBroadcastChannel.instances[0] as ThrowingPostBroadcastChannel)
        .attempted,
    ).toHaveLength(2);
  });

  it("ignores malformed storage JSON", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = openProjectSyncChannel();
    const listener = vi.fn();
    channel.subscribe(listener);

    expect(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: PROJECT_SYNC_STORAGE_KEY,
          newValue: "{not-json",
        }),
      );
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not publish invalid revisions", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const setItem = vi.spyOn(window.localStorage, "setItem");
    setItem.mockClear();
    const channel = openProjectSyncChannel();

    [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].forEach((revision) => {
      channel.publish(revision);
    });

    expect(FakeBroadcastChannel.instances[0].posted).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("continues notifying listeners after one listener throws", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = openProjectSyncChannel();
    const listener = vi.fn();
    channel.subscribe(() => {
      throw new Error("listener failed");
    });
    channel.subscribe(listener);
    const message: ProjectSyncMessage = {
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 2,
      timestamp: Date.now(),
      sourceId: "other-tab",
    };

    expect(() => FakeBroadcastChannel.instances[0].emit(message)).not.toThrow();
    expect(listener).toHaveBeenCalledWith(message);
  });

  it("removes its storage listener when closed", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const channel = openProjectSyncChannel();
    const storageRegistration = addEventListener.mock.calls.find(
      ([type]) => type === "storage",
    );

    expect(storageRegistration).toBeDefined();
    channel.close();
    expect(removeEventListener).toHaveBeenCalledWith(
      "storage",
      storageRegistration?.[1],
    );
  });

  it("unsubscribe and close stop delivery and release the transport", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = openProjectSyncChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    const transport = FakeBroadcastChannel.instances[0];
    const message: ProjectSyncMessage = {
      type: PROJECT_SYNC_MESSAGE_TYPE,
      revision: 1,
      timestamp: Date.now(),
      sourceId: "other-tab",
    };

    unsubscribe();
    transport.emit(message);
    channel.subscribe(listener);
    channel.close();
    transport.emit(message);
    channel.publish(2);

    expect(listener).not.toHaveBeenCalled();
    expect(transport.closed).toBe(true);
    expect(transport.posted).toEqual([]);
  });

  it("does not throw when channel or storage operations fail", () => {
    class ThrowingBroadcastChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      constructor(_name: string) {
        throw new Error("channel denied");
      }
    }
    vi.stubGlobal("BroadcastChannel", ThrowingBroadcastChannel);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });

    expect(() => {
      const channel = openProjectSyncChannel();
      channel.publish(1);
      channel.close();
    }).not.toThrow();
  });

  it("does not throw when BroadcastChannel publish or close fails", () => {
    class FragileBroadcastChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      postMessage() {
        throw new Error("post failed");
      }

      close() {
        throw new Error("close failed");
      }
    }
    vi.stubGlobal("BroadcastChannel", FragileBroadcastChannel);

    expect(() => {
      const channel = openProjectSyncChannel();
      channel.publish(1);
      channel.close();
    }).not.toThrow();
  });
});
