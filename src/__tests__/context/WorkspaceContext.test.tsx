import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutProject } from "../../types";
import { ScoutProvider, useScoutContext } from "../../context/ScoutContext";
import {
  WorkspaceProvider,
  useWorkspace,
} from "../../context/WorkspaceContext";
import { ProjectRepositoryConflictError } from "../../utils/projectRepository";

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

let workspace: ReturnType<typeof useWorkspace> | undefined;
let scout: ReturnType<typeof useScoutContext> | undefined;

function ContextProbe() {
  workspace = useWorkspace();
  scout = useScoutContext();
  return null;
}

function renderWorkspace(initialProjects: ScoutProject[]) {
  persistence.repository.initialize.mockResolvedValue(initialProjects);
  persistence.session.initializeWithRevision.mockResolvedValue({
    projects: initialProjects,
    revision: 1,
  });

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
  it("initializes from the persistence session revision state and closes it on cleanup", async () => {
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
    expect(persistence.session.close).toHaveBeenCalledOnce();
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

    expect(persistence.session.save).toHaveBeenCalledOnce();
    expect(workspace?.saveStatus).toBe("saving");

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

    expect(persistence.session.save).toHaveBeenCalledOnce();
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

    expect(persistence.session.save).toHaveBeenCalledOnce();
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

    expect(persistence.session.save).toHaveBeenCalledOnce();
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

    expect(persistence.session.save).toHaveBeenCalledOnce();
    expect(workspace?.projects).toHaveLength(2);

    releaseSave?.(savedEnvelope([initialProjects[0]]));
    await waitFor(() => expect(workspace?.projects).toHaveLength(1));
    expect(workspace?.projects[0]?.id).toBe("current");
    rendered.unmount();
  });
});
