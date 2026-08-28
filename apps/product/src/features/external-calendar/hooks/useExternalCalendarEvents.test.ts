import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useExternalCalendarEvents } from './useExternalCalendarEvents';

/**
 * query 返り値をテストごとに差し替える。TanStack Query は refetch が失敗しても直前の成功 `data`
 * を保持し続けるため、`isError: true` かつ `data` が populated という組み合わせを再現できる形にする
 * （課金ゲートが `FORBIDDEN` を返すようになった後の実際の状態）。
 */
let mockQuery: {
  data: unknown;
  isError: boolean;
  isLoading: boolean;
} = { data: undefined, isError: false, isLoading: false };

vi.mock('@/lib/date', () => ({ CACHE_5_MINUTES: 5 * 60 * 1000, MS_PER_MINUTE: 60 * 1000 }));

const useQuery = vi.hoisted(() => vi.fn((_input: unknown, _options: unknown) => mockQuery));

vi.mock('@/lib/trpc', () => ({
  api: {
    externalCalendar: {
      listEvents: { useQuery },
    },
  },
}));

const RANGE = { startDate: '2026-08-10T00:00:00.000Z', endDate: '2026-08-17T00:00:00.000Z' };

describe('useExternalCalendarEvents', () => {
  it('成功時は data を ghost 表示用の形へ畳む', () => {
    mockQuery = {
      data: [
        {
          id: 'a',
          title: '  Standup  ',
          calendarName: 'Work',
          startAt: '2026-08-11T09:00:00.000Z',
          endAt: '2026-08-11T09:30:00.000Z',
        },
      ],
      isError: false,
      isLoading: false,
    };

    const { result } = renderHook(() => useExternalCalendarEvents(RANGE));

    expect(result.current.events).toEqual([
      {
        id: 'a',
        title: 'Standup',
        calendarName: 'Work',
        startDate: new Date('2026-08-11T09:00:00.000Z'),
        endDate: new Date('2026-08-11T09:30:00.000Z'),
      },
    ]);
  });

  it('空タイトルは null にフォールバックする', () => {
    mockQuery = {
      data: [
        {
          id: 'a',
          title: '   ',
          calendarName: null,
          startAt: '2026-08-11T09:00:00.000Z',
          endAt: '2026-08-11T09:30:00.000Z',
        },
      ],
      isError: false,
      isLoading: false,
    };

    const { result } = renderHook(() => useExternalCalendarEvents(RANGE));

    expect(result.current.events[0]?.title).toBeNull();
  });

  it('query が error でも直前の成功 data が残っている場合、events は空配列にする（fail closed）', () => {
    // proProcedure が FORBIDDEN を返すようになった後、TanStack Query は refetch 失敗時も
    // 直前の成功 data を保持し続ける。`data ?? []` のままだと解約後も外部予定が描画され続ける。
    mockQuery = {
      data: [
        {
          id: 'stale',
          title: 'Old ghost',
          calendarName: 'Work',
          startAt: '2026-08-11T09:00:00.000Z',
          endAt: '2026-08-11T09:30:00.000Z',
        },
      ],
      isError: true,
      isLoading: false,
    };

    const { result } = renderHook(() => useExternalCalendarEvents(RANGE));

    expect(result.current.events).toEqual([]);
  });

  it('isLoading をそのまま公開する', () => {
    mockQuery = { data: undefined, isError: false, isLoading: true };

    const { result } = renderHook(() => useExternalCalendarEvents(RANGE));

    expect(result.current.isLoading).toBe(true);
  });

  it('cron 周期に合わせて refetchInterval を設定する（開いたまま放置しても追従させる）', () => {
    mockQuery = { data: undefined, isError: false, isLoading: false };

    renderHook(() => useExternalCalendarEvents(RANGE));

    const options = useQuery.mock.calls[0]?.[1] as { refetchInterval?: number };
    expect(options.refetchInterval).toBe(15 * 60 * 1000);
  });
});
