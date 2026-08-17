import type { EventQuery } from './eventQuery';

export const REVIEW_DRILLDOWN_EVENT = 'sportscout:review-drilldown';
const STORAGE_KEY = 'sportscout:pending-review-drilldown';

export type ReviewDrilldownFilters = Partial<EventQuery>;

export function requestReviewDrilldown(filters: ReviewDrilldownFilters): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  window.dispatchEvent(new CustomEvent<ReviewDrilldownFilters>(REVIEW_DRILLDOWN_EVENT, { detail: filters }));
}

export function consumeReviewDrilldown(): ReviewDrilldownFilters | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ReviewDrilldownFilters : undefined;
  } catch {
    return undefined;
  }
}
