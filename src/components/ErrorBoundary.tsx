import React, { Component, ErrorInfo, ReactNode } from 'react';
import { PROJECTS_REPOSITORY_KEY } from '../utils/projectRepository';
import { indexedDbStorageAdapter } from '../utils/storageAdapter';
import {
  SPORTSCOUT_APP_NAME,
  SPORTSCOUT_APP_VERSION,
  SPORTSCOUT_EXPORT_SCHEMA_VERSION,
} from '../appMetadata';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recoveryMessage: string | null;
}

const SCOUT_STORAGE_KEYS = [
  'scout_settings',
  'scout_match_info',
  'scout_teams',
  'scout_events',
  'scout_projects',
  'active_scout_project_id'
];

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    recoveryMessage: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, recoveryMessage: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleExportRecovery = async () => {
    try {
      const localStorageSnapshot = SCOUT_STORAGE_KEYS.reduce<Record<string, string | null>>((acc, key) => {
        acc[key] = localStorage.getItem(key);
        return acc;
      }, {});

      const backup = {
        schemaVersion: SPORTSCOUT_EXPORT_SCHEMA_VERSION,
        app: SPORTSCOUT_APP_NAME,
        appVersion: SPORTSCOUT_APP_VERSION,
        type: 'localStorageRecovery',
        exportedAt: new Date().toISOString(),
        localStorage: localStorageSnapshot,
        indexedDbProjects: await indexedDbStorageAdapter.getItem(PROJECTS_REPOSITORY_KEY),
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', dataStr);
      link.setAttribute('download', `sports_scout_recovery_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.setState({ recoveryMessage: 'Recovery backup exported. Keep this file before resetting.' });
    } catch (e) {
      console.error(e);
      this.setState({ recoveryMessage: 'Could not export recovery backup from this browser.' });
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetRuntime = () => {
    try {
      localStorage.removeItem('scout_settings');
      localStorage.removeItem('scout_match_info');
      localStorage.removeItem('scout_teams');
      localStorage.removeItem('scout_events');
      localStorage.removeItem('active_scout_project_id');

      if ('caches' in window) {
        window.caches.keys().then((keys) => {
          keys.forEach((key) => window.caches.delete(key));
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
      }
      window.location.reload();
    } catch (e) {
      console.error(e);
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans selection:bg-rose-500 selection:text-white">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mb-4 border border-rose-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">The app could not finish loading</h2>
              <p className="text-sm text-slate-400 mt-2">
                Try reloading first. If the problem continues, export a recovery backup before resetting runtime data.
              </p>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900 overflow-auto max-h-40 font-mono text-xs text-rose-300">
              <span className="font-semibold block mb-1">System message:</span>
              {this.state.error?.message || 'Unknown error occurred'}
            </div>

            {this.state.recoveryMessage && (
              <div className="bg-sky-950/50 border border-sky-800 text-sky-200 rounded-xl p-3 text-xs">
                {this.state.recoveryMessage}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-sky-900/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                Reload app
              </button>

              <button
                onClick={() => void this.handleExportRecovery()}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium py-3 px-4 rounded-xl border border-slate-600 transition-all duration-200"
              >
                Export recovery backup
              </button>

              <button
                onClick={this.handleResetRuntime}
                className="w-full bg-rose-700/80 hover:bg-rose-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200"
              >
                Reset runtime data, keep projects
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
