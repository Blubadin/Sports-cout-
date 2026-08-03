import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutProject } from "../../types";
import { ScoutProvider, useScoutContext } from "../../context/ScoutContext";
import {
  WorkspaceProvider,
  useWorkspace,
} from "../../context/WorkspaceContext";
import {
  ProjectRepositoryConflictError,
  type ProjectRepositoryState,
} from "../../utils/projectRepository";

const persistence = vi.hoisted(() => {
  const repository = {
    initialize: vi.fn(),
    initializeWithRevision: vi.fn(),
    save: vi.fn(),
  };
  const session = {
    initializeWithRevision: vi.fn(),
    save: vi.fn(),
    drain: vi.fn(),
    getCurrentRevision: vi.fn(),
    getExternalRevision: vi.fn(),
    close: vi.fn(),
  };
  return {
    repository,
    session,
    createSession: vi.fn(),
  };
});

vi.mock("../../utils/projectRepository", async () => {
  const actual = await vi.importActual<
    typeof import("../../utils/projectRepository")
  >("../../utils/projectRepository");
  return {
    ...actual,
    createProjectRepository: vi.fn(() => persistence.repository),
  };
});

vi.mock("../../utils/projectPersistenceSession", () => ({
  createProjectPersistenceSession: persistence.createSession,
}));

function createProject(id: string): ScoutProject {
  return {
    id,
    title: `Project ${id}`,
    sportType: "volleyball",
    matchInfo: {
      scouterName: "Tester",
      nickname: "QA",
      matchName: `Match ${id}`,
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

function savedEnvelope(projects: ScoutProject[], revision = 2) {
  return {
    schemaVersion: "1.1" as const,
    revision,
    updatedAt: "2026-01-01T00:00:00.000Z",
    projects,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function interceptProjectAutosaveTimers() {
  const pending = new Map<number, () => void>();
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  let nextTimerId = 100_000;

  const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(
    ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
      if (timeout === 250 && typeof handler === "function") {
        const timerId = nextTimerId;
        nextTimerId += 1;
        pending.set(timerId, () => handler(...args));
        return timerId;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout,
  );
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout").mockImplementation(
    (timerId) => {
      if (pending.delete(Number(timerId))) return;
      nativeClearTimeout(timerId);
    },
  );

  return {
    fireAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
    get pendingCount() {
      return pending.size;
    },
    restore() {
      clearTimeoutSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    },
  };
}

let workspace: ReturnType<typeof useWorkspace> | undefined;
let scout: ReturnType<typeof useScoutContext> | undefined;

function ContextProbe() {
  workspace = useWorkspace();
  scout = useScoutContext();
  return null;
}

function renderWorkspace(
  initialProjects: ScoutProject[],
  initialization?: Promise<ProjectRepositoryState>,
) {
  persistence.repository.initialize.mockResolvedValue(initialProjects);
  if (initialization) {
    persistence.session.initializeWithRevision.mockReturnValue(initialization);
  } else {
    persistence.session.initializeWithRevision.mockResolvedValue({
      projects: initialProjects,
      revision: 1,
    });
  }

  const rendered = render(
    <ScoutProvider>
      <WorkspaceProvider>
        <ContextProbe />
      </WorkspaceProvider>
    </ScoutProvider>,
  );

  return {
    ...rendered,
    async ready() {
      await waitFor(() => {
        expect(workspace?.repositoryReady).toBe(true);
      });
      await waitFor(() => {
        expect(workspace?.saveStatus).toBe("saved");
      });
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("scout_settings", JSON.stringify({ uiLanguage: "en" }));
  workspace = undefined;
  scout = undefined;
  vi.clearAllMocks();
  persistence.createSession.mockReturnValue(persistence.session);
  persistence.session.drain.mockResolvedValue(undefined);
  persistence.session.getCurrentRevision.mockReturnValue(1);
  persistence.session.getExternalRevision.mockReturnValue(undefined);
  persistence.session.save.mockImplementation(async (projects: ScoutProject[]) =>
    savedEnvelope(projects),
  );
});

afterEach(() => {
  cleanup();
});

describe("WorkspaceProvider persistence integration", () => {
  it("initializes from the persistence session revision state and drains before closing on cleanup", async () => {
    const legacyProjects = [createProject("legacy")];
    const storedProjects = [createProject("stored")];
    window.localStorage.setItem("scout_projects", JSON.stringify(legacyProjects));
    const rendered = renderWorkspace(storedProjects);

    await rendered.ready();

    expect(persistence.createSession).toHaveBeenCalledOnce();
    expect(persistence.createSession).toHaveBeenCalledWith({
      repository: persistence.repository,
      onConflict: expect.any(Function),
    });
    expect(persistence.session.initializeWithRevision).toHaveBeenCalledWith(
      legacyProjects,
    );
    expect(workspace?.projects.map((project) => project.id)).toEqual(["stored"]);

    rendered.unmount();
    await waitFor(() => expect(persistence.session.drain).toHaveBeenCalledOnce());
    await waitFor(() => expect(persistence.session.close).toHaveBeenCalledOnce());
    expect(persistence.session.drain.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.session.close.mock.invocationCallOrder[0],
    );
  });

  it("routes flush saves through the session and exposes saving then saved status", async () => {
    const initialProjects = [createProject("current")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));

    let releaseSave: ((value: ReturnType<typeof savedEnvelope>) => void) | undefined;
    persistence.session.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSave = resolve;
        }),
    );

    let flush: Promise<void> | undefined;
    act(() => {
      flush = workspace?.flushPendingSaves();
    });

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());
    await waitFor(() => expect(workspace?.saveStatus).toBe("saving"));

    releaseSave?.(savedEnvelope(initialProjects));
    await act(async () => {
      await flush;
    });

    expect(workspace?.saveStatus).toBe("saved");
    expect(workspace?.lastSavedAt).not.toBeNull();
    rendered.unmount();
  });

  it("marks a conflict failed, keeps in-memory projects, and cancels the project switch", async () => {
    const initialProjects = [createProject("current"), createProject("next")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));
    const conflict = new ProjectRepositoryConflictError(1, 2);
    const onConflict = persistence.createSession.mock.calls[0]?.[0].onConflict;
    persistence.session.save.mockImplementationOnce(async () => {
      onConflict(conflict);
      throw conflict;
    });

    act(() => {
      workspace?.openProject("next");
    });

    await waitFor(() => expect(workspace?.saveStatus).toBe("failed"));
    expect(workspace?.activeProjectId).toBe("current");
    expect(workspace?.projects.map((project) => project.id)).toEqual([
      "current",
      "next",
    ]);
    expect(scout?.toastMessage).toMatch(/another tab.*newer data/i);
    expect(scout?.toastMessage).toMatch(/back up.*reload/i);
    rendered.unmount();
  });

  it("flushes the current project before creating and switching to a new one", async () => {
    const initialProjects = [createProject("current")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));

    let releaseSave: ((value: ReturnType<typeof savedEnvelope>) => void) | undefined;
    persistence.session.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSave = resolve;
        }),
    );

    act(() => {
      workspace?.createNewProject("New project", "volleyball");
    });

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());
    expect(workspace?.projects).toHaveLength(1);
    expect(workspace?.activeProjectId).toBe("current");

    releaseSave?.(savedEnvelope(initialProjects));
    await waitFor(() => expect(workspace?.projects).toHaveLength(2));
    expect(workspace?.activeProjectId).not.toBe("current");
    expect(workspace?.projects[1]?.title).toBe("New project");
    rendered.unmount();
  });

  it("cancels new-project creation when flushing the current project fails", async () => {
    const initialProjects = [createProject("current")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));
    persistence.session.save.mockRejectedValueOnce(new Error("storage unavailable"));

    act(() => {
      workspace?.createNewProject("Must not exist", "volleyball");
    });

    await waitFor(() => expect(workspace?.saveStatus).toBe("failed"));
    expect(workspace?.activeProjectId).toBe("current");
    expect(workspace?.projects.map((project) => project.title)).toEqual([
      "Project current",
    ]);
    rendered.unmount();
  });

  it("saves a recovered initial project through the persistence session", async () => {
    window.localStorage.setItem(
      "scout_events",
      JSON.stringify([
        {
          id: "recovered-event",
          no: 1,
          point: 1,
          actions: [],
          eventText: "Recovered event",
          resultText: "0",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );
    const rendered = renderWorkspace([]);

    await rendered.ready();

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());
    expect(persistence.session.save.mock.calls[0]?.[0]).toMatchObject([
      {
        title: "Recovered Scout",
        events: [{ id: "recovered-event" }],
      },
    ]);
    expect(workspace?.projects).toHaveLength(1);
    rendered.unmount();
  });

  it("waits for the session save before opening another project", async () => {
    const initialProjects = [createProject("current"), createProject("next")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));

    let releaseSave: ((value: ReturnType<typeof savedEnvelope>) => void) | undefined;
    persistence.session.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSave = resolve;
        }),
    );

    act(() => {
      workspace?.openProject("next");
    });

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());
    expect(workspace?.activeProjectId).toBe("current");

    releaseSave?.(savedEnvelope(initialProjects));
    await waitFor(() => expect(workspace?.activeProjectId).toBe("next"));
    rendered.unmount();
  });

  it("waits for the session save before deleting a project", async () => {
    const initialProjects = [createProject("current"), createProject("delete")];
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));

    let releaseSave: ((value: ReturnType<typeof savedEnvelope>) => void) | undefined;
    persistence.session.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSave = resolve;
        }),
    );

    act(() => {
      workspace?.deleteProject("delete");
    });

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());
    expect(workspace?.projects).toHaveLength(2);

    releaseSave?.(savedEnvelope([initialProjects[0]]));
    await waitFor(() => expect(workspace?.projects).toHaveLength(1));
    expect(workspace?.projects[0]?.id).toBe("current");
    rendered.unmount();
  });

  it("does not let a pending project autosave restore a deleted project", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [createProject("current"), createProject("delete")];
    const deleteSave = createDeferred<ReturnType<typeof savedEnvelope>>();
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));
      await waitFor(() => expect(autosaveTimers.pendingCount).toBeGreaterThan(0));
      persistence.session.save.mockImplementationOnce(() => deleteSave.promise);

      act(() => {
        workspace?.deleteProject("delete");
      });
      await waitFor(() =>
        expect(persistence.session.save).toHaveBeenCalledOnce(),
      );

      act(() => {
        workspace?.renameProject("current", "Latest current");
      });
      expect(autosaveTimers.pendingCount).toBe(0);

      act(() => {
        autosaveTimers.fireAll();
      });
      expect(persistence.session.save).toHaveBeenCalledOnce();

      deleteSave.resolve(savedEnvelope([initialProjects[0]]));
      await waitFor(() =>
        expect(persistence.session.save).toHaveBeenCalledTimes(2),
      );
      expect(
        persistence.session.save.mock.calls.map(([projects]) =>
          projects.map((project: ScoutProject) => project.id),
        ),
      ).toEqual([["current"], ["current"]]);

      await waitFor(() =>
        expect(workspace?.projects.map((project) => project.id)).toEqual([
          "current",
        ]),
      );
    } finally {
      deleteSave.resolve(savedEnvelope([initialProjects[0]]));
      rendered.unmount();
      autosaveTimers.restore();
    }
  });

  it("serializes rapid deletes so each deletion uses the latest projects", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [
      createProject("current"),
      createProject("delete-first"),
      createProject("delete-second"),
    ];
    const firstDeleteSave = createDeferred<ReturnType<typeof savedEnvelope>>();
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));
      persistence.session.save.mockImplementationOnce(
        () => firstDeleteSave.promise,
      );

      act(() => {
        workspace?.deleteProject("delete-first");
        workspace?.deleteProject("delete-second");
      });

      await waitFor(() =>
        expect(persistence.session.save).toHaveBeenCalledOnce(),
      );

      firstDeleteSave.resolve(
        savedEnvelope([
          initialProjects[0],
          initialProjects[2],
        ]),
      );
      await waitFor(() =>
        expect(persistence.session.save).toHaveBeenCalledTimes(2),
      );
      await waitFor(() =>
        expect(workspace?.projects.map((project) => project.id)).toEqual([
          "current",
        ]),
      );
      expect(
        persistence.session.save.mock.calls.map(([projects]) =>
          projects.map((project: ScoutProject) => project.id),
        ),
      ).toEqual([
        ["current", "delete-second"],
        ["current"],
      ]);
    } finally {
      firstDeleteSave.resolve(savedEnvelope(initialProjects));
      rendered.unmount();
      autosaveTimers.restore();
    }
  });

  it("waits for transition and session queues before closing during cleanup", async () => {
    const initialProjects = [createProject("current")];
    const queuedSave = createDeferred<ReturnType<typeof savedEnvelope>>();
    const sessionDrain = createDeferred<void>();
    const rendered = renderWorkspace(initialProjects);
    await rendered.ready();
    await waitFor(() => expect(workspace?.activeProjectId).toBe("current"));
    persistence.session.save.mockImplementationOnce(() => queuedSave.promise);
    persistence.session.drain.mockReturnValueOnce(sessionDrain.promise);

    let flush: Promise<void> | undefined;
    try {
      act(() => {
        flush = workspace?.flushPendingSaves();
      });
      await waitFor(() =>
        expect(persistence.session.save).toHaveBeenCalledOnce(),
      );

      rendered.unmount();
      expect(persistence.session.close).not.toHaveBeenCalled();

      queuedSave.resolve(savedEnvelope(initialProjects));
      await act(async () => {
        await flush;
      });
      await waitFor(() => expect(persistence.session.drain).toHaveBeenCalledOnce());
      expect(persistence.session.close).not.toHaveBeenCalled();

      sessionDrain.resolve();
      await waitFor(() => expect(persistence.session.close).toHaveBeenCalledOnce());
    } finally {
      queuedSave.resolve(savedEnvelope(initialProjects));
      sessionDrain.resolve();
    }
  });

  it("rejects project creation before repository initialization preserves stored projects", async () => {
    const storedProjects = [createProject("stored")];
    const initialization = createDeferred<ProjectRepositoryState>();
    const rendered = renderWorkspace(storedProjects, initialization.promise);

    act(() => {
      workspace?.createNewProject("Too early", "volleyball");
    });
    expect(workspace?.projects).toEqual([]);

    initialization.resolve({ projects: storedProjects, revision: 1 });
    await rendered.ready();
    expect(workspace?.projects.map((project) => project.id)).toEqual(["stored"]);
    rendered.unmount();
  });

  it("rejects project import before repository initialization preserves stored projects", async () => {
    const storedProjects = [createProject("stored")];
    const initialization = createDeferred<ProjectRepositoryState>();
    const rendered = renderWorkspace(storedProjects, initialization.promise);
    let imported: boolean | undefined;

    act(() => {
      imported = workspace?.importProject(createProject("too-early"));
    });
    expect(imported).toBe(false);
  });

  it("Test 1: import into empty workspace survives immediate flush before debounce", async () => {
    const rendered = renderWorkspace([]);
    await rendered.ready();

    act(() => {
      workspace?.importProject(createProject("imported-1"));
      workspace?.flushPendingSaves();
    });

    await waitFor(() => expect(persistence.session.save).toHaveBeenCalled());
    const savedCalls = persistence.session.save.mock.calls;
    const lastSavedProjects = savedCalls[savedCalls.length - 1][0];
    expect(lastSavedProjects.some((p: ScoutProject) => p.title.includes("imported-1"))).toBe(true);
  });

  it("Test 2: create project survives unmount while project loading state is true", async () => {
    const rendered = renderWorkspace([]);
    await rendered.ready();

    act(() => {
      workspace?.createNewProject("Fresh Project", "volleyball");
    });

    rendered.unmount();

    await waitFor(() => expect(persistence.session.close).toHaveBeenCalledOnce());
    const savedCalls = persistence.session.save.mock.calls;
    const allSavedProjects = savedCalls.flatMap(([projects]) => projects);
    expect(allSavedProjects.some((p: ScoutProject) => p.title === "Fresh Project")).toBe(true);
  });

  it("Test 3: cleanup persists pending rename before closing session", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [createProject("proj-1")];
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      act(() => {
        workspace?.renameProject("proj-1", "Renamed Project Title");
      });

      rendered.unmount();

      await waitFor(() => expect(persistence.session.drain).toHaveBeenCalledOnce());
      await waitFor(() => expect(persistence.session.close).toHaveBeenCalledOnce());

      const savedCalls = persistence.session.save.mock.calls;
      const lastSavedProjects = savedCalls[savedCalls.length - 1][0];
      expect(lastSavedProjects[0]?.title).toBe("Renamed Project Title");
    } finally {
      autosaveTimers.restore();
    }
  });

  it("Test 4: cleanup persists pending duplicate and import before closing session", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [createProject("proj-1")];
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      act(() => {
        workspace?.duplicateProject("proj-1");
        workspace?.importProject(createProject("imported-2"));
      });

      rendered.unmount();

      await waitFor(() => expect(persistence.session.drain).toHaveBeenCalledOnce());
      await waitFor(() => expect(persistence.session.close).toHaveBeenCalledOnce());

      const savedCalls = persistence.session.save.mock.calls;
      const lastSavedProjects = savedCalls[savedCalls.length - 1][0];
      expect(lastSavedProjects).toHaveLength(3);
    } finally {
      autosaveTimers.restore();
    }
  });

  it("Test 5: slow delete serializes a concurrent rename without a stale overwrite", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [createProject("A"), createProject("B")];
    const deleteSave = createDeferred<ReturnType<typeof savedEnvelope>>();
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      persistence.session.save.mockImplementationOnce(() => deleteSave.promise);

      act(() => {
        workspace?.deleteProject("B");
      });
      await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());

      act(() => {
        workspace?.renameProject("A", "Renamed A");
      });

      deleteSave.resolve(savedEnvelope([initialProjects[0]]));

      await waitFor(() => expect(persistence.session.save).toHaveBeenCalledTimes(2));
      expect(persistence.session.save.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ id: "A", title: "Project A" }),
      ]);
      expect(persistence.session.save.mock.calls[1]?.[0]).toEqual([
        expect.objectContaining({ id: "A", title: "Renamed A" }),
      ]);
      expect(autosaveTimers.pendingCount).toBe(0);
      act(() => {
        autosaveTimers.fireAll();
      });
      expect(persistence.session.save).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(workspace?.projects.map((p) => p.id)).toEqual(["A"]));
      await waitFor(() => expect(workspace?.projects[0]?.title).toBe("Renamed A"));
    } finally {
      deleteSave.resolve(savedEnvelope(initialProjects));
      autosaveTimers.restore();
      rendered.unmount();
    }
  });

  it("Test 6: slow delete serializes concurrent import and video-time updates", async () => {
    const autosaveTimers = interceptProjectAutosaveTimers();
    const initialProjects = [createProject("A"), createProject("B")];
    const deleteSave = createDeferred<ReturnType<typeof savedEnvelope>>();
    const rendered = renderWorkspace(initialProjects);

    try {
      await rendered.ready();
      persistence.session.save.mockImplementationOnce(() => deleteSave.promise);

      act(() => {
        workspace?.deleteProject("B");
      });
      await waitFor(() => expect(persistence.session.save).toHaveBeenCalledOnce());

      const importedC = createProject("C");
      act(() => {
        workspace?.importProject(importedC);
        workspace?.updateProjectLastVideoTime(42.5);
      });

      deleteSave.resolve(savedEnvelope([initialProjects[0]]));

      await waitFor(() => expect(persistence.session.save).toHaveBeenCalledTimes(3));
      expect(persistence.session.save.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ id: "A", title: "Project A" }),
      ]);
      expect(persistence.session.save.mock.calls[1]?.[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Project C" }),
        ]),
      );
      const finalSaveProjects = persistence.session.save.mock.calls[2]?.[0] as ScoutProject[];
      expect(finalSaveProjects.some((project) => project.title === "Project C")).toBe(true);
      expect(finalSaveProjects.find((project) => project.id === "A")?.videoMeta?.lastVideoTime).toBe(42.5);
      expect(autosaveTimers.pendingCount).toBe(0);
      act(() => {
        autosaveTimers.fireAll();
      });
      expect(persistence.session.save).toHaveBeenCalledTimes(3);

      await waitFor(() => expect(workspace?.projects.some((project) => project.title === "Project C")).toBe(true));
      expect(workspace?.projects.find((p) => p.id === "A")?.videoMeta?.lastVideoTime).toBe(42.5);
    } finally {
      deleteSave.resolve(savedEnvelope(initialProjects));
      autosaveTimers.restore();
      rendered.unmount();
    }
  });

  it("assigns fresh identities when the same project payload is imported twice", async () => {
    const rendered = renderWorkspace([]);
    await rendered.ready();
    const importedProject = createProject("duplicate-source");

    act(() => {
      workspace?.importProject(importedProject);
      workspace?.importProject(importedProject);
    });

    await waitFor(() => expect(workspace?.projects).toHaveLength(2));
    const importedIds = workspace?.projects.map((project) => project.id) ?? [];
    expect(new Set(importedIds).size).toBe(importedIds.length);
  });
});
