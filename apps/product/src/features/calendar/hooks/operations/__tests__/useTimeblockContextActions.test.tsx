import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '../../../types/calendar.types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'ja',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/features/timeblock', () => ({
  useTimeblockWriteMutations: () => ({
    deleteRecord: { mutate: vi.fn() },
    deletePlan: { mutate: vi.fn() },
    skipPlan: { mutate: vi.fn() },
    unskipPlan: { mutate: vi.fn() },
  }),
}));

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn() },
}));

import { useTimeblockContextActions } from '../useTimeblockContextActions';

const taggedEntry = {
  id: 'entry-1',
  kind: 'plan',
  tagId: 'tag-1',
  startDate: new Date(2026, 2, 25, 9),
  actualStartDate: null,
} as unknown as CalendarEvent;

describe('useTimeblockContextActions - Review navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/report へ遷移する（カレンダー内パネルは廃止済み、#2181 Step 4）', () => {
    const { result } = renderHook(() => useTimeblockContextActions());

    act(() => result.current.handleViewStats(taggedEntry));

    expect(mocks.push).toHaveBeenCalledWith('/ja/report?date=2026-03-25');
  });

  it('tagなしentryではReviewを開かない', () => {
    const { result } = renderHook(() => useTimeblockContextActions());

    act(() => result.current.handleViewStats({ ...taggedEntry, tagId: null }));

    expect(mocks.push).not.toHaveBeenCalled();
  });
});
