type FeatureFlagEnvironment = Partial<Record<'VITE_ENABLE_WORKSTATION' | 'VITE_ENABLE_FOOTBALL_PICCO', string>>;

export function resolveFeatureFlags(environment: FeatureFlagEnvironment) {
  return Object.freeze({
    // Workstation is the single supported desktop and responsive UI shell.
    workstation: environment.VITE_ENABLE_WORKSTATION?.trim() !== 'false',
    footballPicco: environment.VITE_ENABLE_FOOTBALL_PICCO?.trim() === 'true',
  });
}

export const FEATURE_FLAGS = resolveFeatureFlags({
  VITE_ENABLE_WORKSTATION: import.meta.env.VITE_ENABLE_WORKSTATION,
  VITE_ENABLE_FOOTBALL_PICCO: import.meta.env.VITE_ENABLE_FOOTBALL_PICCO,
});
