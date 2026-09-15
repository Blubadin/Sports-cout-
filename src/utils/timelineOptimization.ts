/**
 * Timeline Viewport & Performance Optimization Helpers
 * Phase 14: Memoized Selectors, Visible Range Windowing & Query Cache
 */

export interface ViewportTimeRange {
  minTime: number;
  maxTime: number;
}

/**
 * Calculates the visible time window on a timeline based on scroll position,
 * client width, total scrollable width, and total media duration.
 * Includes a configurable buffer percentage on either side to prevent pop-in.
 */
export function calculateVisibleTimeRange(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  duration: number,
  bufferRatio = 0.2,
): ViewportTimeRange | null {
  if (scrollWidth <= 0 || clientWidth <= 0 || duration <= 0) {
    return null;
  }

  // If entire timeline fits within viewport, everything is visible
  if (scrollWidth <= clientWidth) {
    return { minTime: 0, maxTime: duration };
  }

  const bufferPx = clientWidth * bufferRatio;
  const minX = Math.max(0, scrollLeft - bufferPx);
  const maxX = Math.min(scrollWidth, scrollLeft + clientWidth + bufferPx);

  const minTime = Math.max(0, (minX / scrollWidth) * duration);
  const maxTime = Math.min(duration, (maxX / scrollWidth) * duration);

  return { minTime, maxTime };
}

/**
 * Filters a list of items down to those overlapping with the visible time window.
 * If viewportRange is null (e.g. 1x zoom or full timeline visible), returns original list.
 */
export function filterItemsInVisibleTimeRange<T>(
  items: T[],
  getTimeRange: (item: T) => { start: number; end: number },
  viewportRange: ViewportTimeRange | null,
  isForceIncluded?: (item: T) => boolean,
): T[] {
  if (!viewportRange) return items;

  return items.filter((item) => {
    if (isForceIncluded && isForceIncluded(item)) return true;
    const { start, end } = getTimeRange(item);
    return end >= viewportRange.minTime && start <= viewportRange.maxTime;
  });
}
