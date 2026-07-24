import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceMenu from '../components/WorkspaceMenu';

const testState = vi.hoisted(() => ({
  language: 'en' as 'en' | 'th',
  workspace: {
    activeProjectId: null as string | null,
    projects: [] as Array<{ id: string; title: string }>,
    repositoryReady: false,
    saveStatus: 'loading',
    createNewProject: vi.fn(),
    importProject: vi.fn(),
  },
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('../context/ScoutContext', () => ({
  ScoutProvider: ({ children }: { children: React.ReactNode }) => children,
  useScoutContext: () => ({
    toastMessage: null,
    matchInfo: {
      sportType: 'volleyball',
      setOrGame: '1',
      currentPoint: 0,
    },
    settings: {
      uiLanguage: testState.language,
      workspaceExperience: 'classic',
      theme: 'light',
      darkMode: false,
    },
    setSettings: vi.fn(),
    teams: [],
    events: [],
    videoTime: 0,
    canUndoEventAction: false,
    canRedoEventAction: false,
    undoEventAction: vi.fn(),
    redoEventAction: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock('../context/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => testState.workspace,
}));

vi.mock('../components/DiagnosticLogs', () => ({ default: () => null }));
vi.mock('../components/PWAUpdatePrompt', () => ({ default: () => null }));
vi.mock('../components/ui/CustomSelect', () => ({ default: () => <div /> }));
vi.mock('../hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ isInstallable: false, promptInstall: vi.fn() }),
}));

import App from '../App';

describe('App repository initialization boundary', () => {
  beforeEach(() => {
    testState.language = 'en';
    testState.workspace.activeProjectId = null;
    testState.workspace.projects = [];
    testState.workspace.repositoryReady = false;
    testState.workspace.saveStatus = 'loading';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ['en', 'Preparing workspace'],
    ['th', '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e17\u0e33\u0e07\u0e32\u0e19'],
  ] as const)('hides empty-project actions while loading in %s', (language, message) => {
    testState.language = language;

    const { rerender } = render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: /Load four-sport pilot samples/i })).not.toBeInTheDocument();

    testState.workspace.repositoryReady = true;
    rerender(<App />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    if (language === 'en') {
      expect(screen.getByRole('button', { name: /Load four-sport pilot samples/i })).toBeInTheDocument();
    }
  });

  it('blocks a legacy active project until the repository is ready', () => {
    testState.workspace.activeProjectId = 'active-project';
    testState.workspace.projects = [{ id: 'active-project', title: 'Active project' }];

    const { rerender } = render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('Preparing workspace');
    expect(screen.queryByRole('tablist', { name: 'Analysis views' })).not.toBeInTheDocument();

    testState.workspace.repositoryReady = true;
    rerender(<App />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Analysis views' })).toBeInTheDocument();
  });

  it('Test 7: header workspace controls are disabled while repositoryReady is false', () => {
    testState.workspace.activeProjectId = 'legacy-1';
    testState.workspace.projects = [{ id: 'legacy-1', title: 'Legacy Project' }];
    testState.workspace.repositoryReady = false;

    const { rerender } = render(<WorkspaceMenu />);

    const menuToggle = screen.getByTestId('workspace-menu-toggle');
    const newProjectBtn = screen.getByTitle('New Scout Project');

    expect(menuToggle).toBeDisabled();
    expect(newProjectBtn).toBeDisabled();

    testState.workspace.repositoryReady = true;
    rerender(<WorkspaceMenu />);

    expect(menuToggle).not.toBeDisabled();
    expect(newProjectBtn).not.toBeDisabled();
  });
});

