type MediaLikeEvent = {
  currentTarget?: {
    currentTime?: number;
    duration?: number;
  };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const readMediaCurrentTime = (
  event: MediaLikeEvent | null | undefined,
  fallback = 0,
): number => {
  const currentTime = event?.currentTarget?.currentTime;
  return isFiniteNumber(currentTime) ? currentTime : fallback;
};

export const readMediaDuration = (
  valueOrEvent: number | MediaLikeEvent | null | undefined,
  fallback = 0,
): number => {
  const duration =
    typeof valueOrEvent === 'number'
      ? valueOrEvent
      : valueOrEvent?.currentTarget?.duration;

  return isFiniteNumber(duration) && duration > 0 ? duration : fallback;
};
