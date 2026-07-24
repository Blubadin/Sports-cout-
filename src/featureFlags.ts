export type InterfaceMode = 'classic' | 'workstation';

export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'classic';

type FeatureFlagEnvironment = Partial<Record<'VITE_ENABLE_WORKSTATION' | 'VITE_ENABLE_FOOTBALL_PICCO', string>>;

export function resolveFeatureFlags(environment: FeatureFlagEnvironment) {
  return Object.freeze({
    workstation: environment.VITE_ENABLE_WORKSTATION === 'true',
    footballPicco: environment.VITE_ENABLE_FOOTBALL_PICCO === 'true',
  });
}

export const FEATURE_FLAGS = resolveFeatureFlags({
  VITE_ENABLE_WORKSTATION: import.meta.env.VITE_ENABLE_WORKSTATION,
  VITE_ENABLE_FOOTBALL_PICCO: import.meta.env.VITE_ENABLE_FOOTBALL_PICCO,
});
