import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVIEW_DRILLDOWN_EVENT,
  consumeReviewDrilldown,
  requestReviewDrilldown,
} from '../../utils/reviewDrilldown';

describe('review drilldown bridge', () => {
  beforeEach(() => sessionStorage.clear());

  it('notifies navigation and preserves filters until the Review table mounts', () => {
    const listener = vi.fn();
    window.addEventListener(REVIEW_DRILLDOWN_EVENT, listener);

    requestReviewDrilldown({ skill: 'SET', startArea: 'Z3', systemContext: 'out_of_system' });

    expect(listener).toHaveBeenCalledOnce();
    expect(consumeReviewDrilldown()).toEqual({ skill: 'SET', startArea: 'Z3', systemContext: 'out_of_system' });
    expect(consumeReviewDrilldown()).toBeUndefined();
    window.removeEventListener(REVIEW_DRILLDOWN_EVENT, listener);
  });
});
