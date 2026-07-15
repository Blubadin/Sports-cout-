export type LocalVideoState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'permission-required'
  | 'missing'
  | 'unsupported'
  | 'denied'
  | 'error';

export type LocalVideoStateInput = {
  hasSource: boolean;
  hasStoredHandle: boolean;
  permission?: 'granted' | 'denied' | 'prompt';
  isVideoFile?: boolean;
};

export function resolveLocalVideoState({
  hasSource,
  hasStoredHandle,
  permission = 'prompt',
  isVideoFile = true,
}: LocalVideoStateInput): LocalVideoState {
  if (!hasSource) return 'idle';
  if (!isVideoFile) return 'unsupported';
  if (!hasStoredHandle) return 'missing';
  if (permission === 'granted') return 'ready';
  if (permission === 'denied') return 'denied';
  return 'permission-required';
}
