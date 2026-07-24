import { describe, expect, it, vi } from "vitest";
import type { ScoutProject } from "../../types";
import {
  ProjectRepositoryConflictError,
  type ProjectRepositoryState,
  type SavedProjectRepositoryEnvelope,
} from "../../utils/projectRepository";
import {
  createProjectPersistenceSession,
  type ProjectPersistenceRepository,
} from "../../utils/projectPersistenceSession";
import {
  PROJECT_SYNC_MESSAGE_TYPE,
  type ProjectSyncChannel,
  type ProjectSyncListener,
  type ProjectSyncMessage,
} from "../../utils/projectSyncChannel";

function createProject(id: string): ScoutProject {
  return {
    id,
    title: `Project ${id}`,
    sportType: "volleyball",
    matchInfo: {
      scouterName: "Tester",
      nickname: "QA",
      matchName: "Test match",
      matchType: "Team",
      setOrGame: "1",
      currentPoint: 1,
      sportType: "volleyball",
    },
    teams: [],
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createSavedEnvelope(
  projects: ScoutProject[],
  revision: number,
): SavedProjectRepositoryEnvelope {
  return {
    schemaVersion: "1.2",
    revision,
    updatedAt: "2026-01-01T00:00:00.000Z",
    projects,
  };
}

function createRepository(
  initialState: ProjectRepositoryState = { projects: [], revision: 0 },
) {
  let revision = initialState.revision;
  const initializeWithRevision = vi.fn(async () => initialState);
  const save = vi.fn(
    async (projects: ScoutProject[], expectedRevision?: number) => {
      revision += 1;
      return createSavedEnvelope(projects, revision);
    },
  );
  return {
    repository: { initializeWithRevision, save } satisfies ProjectPersistenceRepository,
    initializeWithRevision,
    save,
    setRevision(nextRevision: number) {
      revision = nextRevision;
    },
  };
}

function createSyncChannelHarness() {
  const listeners = new Set<ProjectSyncListener>();
  const publish = vi.fn<(revision: number) => void>();
  const close = vi.fn<() => void>();
  const unsubscribe = vi.fn<() => void>();
  const channel: ProjectSyncChannel = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        unsubscribe();
        listeners.delete(listener);
      };
    },
    publish,
    close,
  };

  return {
    channel,
    publish,
    close,
    unsubscribe,
    emit(revision: number) {
      const message: ProjectSyncMessage = {
        type: PROJECT_SYNC_MESSAGE_TYPE,
        revision,
        timestamp: Date.now(),
        sourceId: "other-tab",
      };
      for (const listener of listeners) listener(message);
    },
  };
}

describe("projectPersistenceSession", () => {
  it("initializes from repository state and exposes its revision", async () => {
    const storedProjects = [createProject("stored")];
    const { repository, initializeWithRevision } = createRepository({
      projects: storedProjects,
      revision: 7,
    });
    const sync = createSyncChannelHarness();
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });
    const legacyProjects = [createProject("legacy")];

    const state = await session.initializeWithRevision(legacyProjects);

    expect(initializeWithRevision).toHaveBeenCalledWith(legacyProjects);
    expect(state).toEqual({ projects: storedProjects, revision: 7 });
    expect(session.getCurrentRevision()).toBe(7);
    expect(session.getExternalRevision()).toBeUndefined();
  });

  it("includes initialization in drain", async () => {
    const { repository, initializeWithRevision } = createRepository();
    const sync = createSyncChannelHarness();
    let releaseInitialize: (() => void) | undefined;
    const initializeReleased = new Promise<void>((resolve) => {
      releaseInitialize = resolve;
    });
    initializeWithRevision.mockImplementation(async () => {
      await initializeReleased;
      return { projects: [], revision: 3 };
    });
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });

    const initialize = session.initializeWithRevision([]);
    let drained = false;
    const drain = session.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();

    expect(drained).toBe(false);

    releaseInitialize?.();
    await expect(initialize).resolves.toMatchObject({ revision: 3 });
    await drain;
    expect(drained).toBe(true);
  });

  it("runs same-tab saves FIFO and reads the latest revision when each starts", async () => {
    const { repository, save } = createRepository({ projects: [], revision: 4 });
    const sync = createSyncChannelHarness();
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    save.mockImplementation(async (projects, expectedRevision) => {
      if (projects[0]?.id === "a") await firstReleased;
      return createSavedEnvelope(projects, (expectedRevision ?? -1) + 1);
    });
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });
    await session.initializeWithRevision([]);

    const first = session.save([createProject("a")]);
    const second = session.save([createProject("b")]);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toBe(4);

    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { revision: 5, projects: [{ id: "a" }] },
      { revision: 6, projects: [{ id: "b" }] },
    ]);
    expect(save.mock.calls.map((call) => call[1])).toEqual([4, 5]);
    expect(sync.publish.mock.calls.map((call) => call[0])).toEqual([5, 6]);
    expect(session.getCurrentRevision()).toBe(6);
  });

  it("updates the current revision before publishing a successful save", async () => {
    const projects = [createProject("saved")];
    const { repository, save } = createRepository({ projects: [], revision: 2 });
    const sync = createSyncChannelHarness();
    let revisionSeenAtPublish: number | undefined;
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });
    sync.publish.mockImplementation(() => {
      revisionSeenAtPublish = session.getCurrentRevision();
    });
    await session.initializeWithRevision([]);

    const envelope = await session.save(projects);

    expect(save).toHaveBeenCalledWith(projects, 2);
    expect(envelope.projects).toBe(projects);
    expect(revisionSeenAtPublish).toBe(3);
    expect(sync.publish).toHaveBeenCalledWith(3);
  });

  it("retries transient failures up to three total attempts using injected wait", async () => {
    const { repository, save } = createRepository({ projects: [], revision: 1 });
    const sync = createSyncChannelHarness();
    const wait = vi.fn(async () => undefined);
    save
      .mockRejectedValueOnce(
        new DOMException("transaction aborted", "AbortError"),
      )
      .mockRejectedValueOnce(
        new DOMException("storage state is unknown", "UnknownError"),
      )
      .mockResolvedValueOnce(createSavedEnvelope([createProject("saved")], 2));
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      wait,
    });
    await session.initializeWithRevision([]);

    await expect(session.save([createProject("saved")])).resolves.toMatchObject({
      revision: 2,
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls.map((call) => call[1])).toEqual([1, 1, 1]);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("stops after three failed transient attempts", async () => {
    const { repository, save } = createRepository();
    const sync = createSyncChannelHarness();
    const wait = vi.fn(async () => undefined);
    const failure = new DOMException("transaction aborted", "AbortError");
    save.mockRejectedValue(failure);
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      wait,
    });
    await session.initializeWithRevision([]);

    await expect(session.save([createProject("failed")])).rejects.toBe(failure);
    expect(save).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(sync.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["generic errors", new Error("programming failure")],
    ["type errors", new TypeError("invalid repository result")],
    [
      "validation errors",
      new DOMException("invalid data", "DataError"),
    ],
    [
      "quota errors",
      new DOMException("storage quota exceeded", "QuotaExceededError"),
    ],
    [
      "security errors",
      new DOMException("storage access denied", "SecurityError"),
    ],
  ])("does not retry %s", async (_label, failure) => {
    const { repository, save } = createRepository();
    const sync = createSyncChannelHarness();
    const wait = vi.fn(async () => undefined);
    save.mockRejectedValue(failure);
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      wait,
    });
    await session.initializeWithRevision([]);

    await expect(session.save([createProject("failed")])).rejects.toBe(
      failure,
    );
    expect(save).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("never retries repository conflicts and reports external/current state", async () => {
    const { repository, save } = createRepository({ projects: [], revision: 2 });
    const sync = createSyncChannelHarness();
    const wait = vi.fn(async () => undefined);
    const onConflict = vi.fn();
    const conflict = new ProjectRepositoryConflictError(2, 3);
    save.mockRejectedValue(conflict);
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      wait,
      onConflict,
    });
    await session.initializeWithRevision([]);

    await expect(session.save([createProject("stale")])).rejects.toBe(conflict);
    expect(save).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(session.getCurrentRevision()).toBe(2);
    expect(session.getExternalRevision()).toBe(3);
    expect(onConflict).toHaveBeenCalledOnce();
    expect(onConflict).toHaveBeenCalledWith(conflict);
    expect(sync.publish).not.toHaveBeenCalled();
  });

  it("ignores older messages and fails closed after a higher external revision", async () => {
    const { repository, save } = createRepository({ projects: [], revision: 4 });
    const sync = createSyncChannelHarness();
    const onConflict = vi.fn();
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      onConflict,
    });
    await session.initializeWithRevision([]);

    sync.emit(3);
    sync.emit(4);
    expect(session.getExternalRevision()).toBeUndefined();
    expect(onConflict).not.toHaveBeenCalled();

    sync.emit(7);
    sync.emit(6);
    sync.emit(7);

    expect(session.getCurrentRevision()).toBe(4);
    expect(session.getExternalRevision()).toBe(7);
    expect(onConflict).toHaveBeenCalledOnce();
    expect(onConflict.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 4,
      currentRevision: 7,
    });

    await expect(session.save([createProject("blocked")])).rejects.toMatchObject({
      expectedRevision: 4,
      currentRevision: 7,
    });
    expect(save).not.toHaveBeenCalled();
    expect(session.getCurrentRevision()).toBe(4);
  });

  it("deduplicates a broadcast conflict followed by the matching repository conflict", async () => {
    const { repository, save } = createRepository({ projects: [], revision: 2 });
    const sync = createSyncChannelHarness();
    const onConflict = vi.fn();
    let releaseSave: (() => void) | undefined;
    const saveReleased = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const conflict = new ProjectRepositoryConflictError(2, 3);
    save.mockImplementation(async () => {
      await saveReleased;
      throw conflict;
    });
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
      onConflict,
    });
    await session.initializeWithRevision([]);

    const pendingSave = session.save([createProject("stale")]);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    sync.emit(3);
    releaseSave?.();

    await expect(pendingSave).rejects.toBe(conflict);
    expect(onConflict).toHaveBeenCalledOnce();
    expect(onConflict.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 2,
      currentRevision: 3,
    });
  });

  it("allows saves accepted before close and rejects future saves", async () => {
    const { repository, save } = createRepository();
    const sync = createSyncChannelHarness();
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    save.mockImplementation(async (projects, expectedRevision) => {
      if (projects[0]?.id === "first") await firstReleased;
      return createSavedEnvelope(projects, (expectedRevision ?? -1) + 1);
    });
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });
    await session.initializeWithRevision([]);

    const first = session.save([createProject("first")]);
    const second = session.save([createProject("second")]);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    session.close();
    const afterClose = session.save([createProject("after-close")]);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { revision: 1, projects: [{ id: "first" }] },
      { revision: 2, projects: [{ id: "second" }] },
    ]);
    await expect(afterClose).rejects.toThrow(
      "Project persistence session is closed",
    );
    await session.drain();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("drains queued work and closes the subscription and channel once", async () => {
    const { repository, save } = createRepository();
    const sync = createSyncChannelHarness();
    let releaseSave: (() => void) | undefined;
    const saveReleased = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    save.mockImplementation(async (projects, expectedRevision) => {
      await saveReleased;
      return createSavedEnvelope(projects, (expectedRevision ?? -1) + 1);
    });
    const session = createProjectPersistenceSession({
      repository,
      syncChannel: sync.channel,
    });
    await session.initializeWithRevision([]);
    void session.save([createProject("queued")]);

    let drained = false;
    const drain = session.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseSave?.();
    await drain;
    expect(drained).toBe(true);

    session.close();
    session.close();
    expect(sync.unsubscribe).toHaveBeenCalledOnce();
    expect(sync.close).toHaveBeenCalledOnce();
  });
});
