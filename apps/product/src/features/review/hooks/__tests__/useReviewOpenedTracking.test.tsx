import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReviewOpenedTracking } from '../useReviewOpenedTracking';

const mutate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc', () => ({
  api: {
    review: {
      trackOpened: {
        useMutation: () => ({ mutate }),
      },
    },
  },
}));

describe('useReviewOpenedTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks an initially active panel once across rerenders', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useReviewOpenedTracking(active),
      { initialProps: { active: true } },
    );

    rerender({ active: true });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('tracks each inactive-to-active transition once', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useReviewOpenedTracking(active),
      { initialProps: { active: false } },
    );

    rerender({ active: true });
    rerender({ active: true });
    rerender({ active: false });
    rerender({ active: true });

    expect(mutate).toHaveBeenCalledTimes(2);
  });
});
