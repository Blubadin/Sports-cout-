export type PwaUpdateBlocker = 'pending-action' | 'project-save' | 'save-failed';

type UpdateSafetyState = {
  hasPendingAction: boolean;
  saveStatus: 'loading' | 'pending' | 'saving' | 'saved' | 'failed';
};

export function getPwaUpdateBlockers(state: UpdateSafetyState): PwaUpdateBlocker[] {
  const blockers: PwaUpdateBlocker[] = [];
  if (state.hasPendingAction) blockers.push('pending-action');
  if (state.saveStatus === 'failed') blockers.push('save-failed');
  else if (state.saveStatus !== 'saved') blockers.push('project-save');
  return blockers;
}

export function hasPendingScoutInput(currentAction: Record<string, unknown>, currentActions: unknown[]): boolean {
  return currentActions.length > 0 || Object.values(currentAction).some((value) => {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
}
