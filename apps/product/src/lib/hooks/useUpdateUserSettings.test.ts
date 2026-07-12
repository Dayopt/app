import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpdateUserSettings } from './useUpdateUserSettings';

const cancel = vi.fn();
const getData = vi.fn();
const setData = vi.fn();
const invalidateSettings = vi.fn();
const invalidatePlans = vi.fn();
const invalidateLogs = vi.fn();
const invalidateStatistics = vi.fn();
let mutationOptions: Record<string, (...args: never[]) => unknown>;

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      userSettings: { get: { cancel, getData, setData, invalidate: invalidateSettings } },
      plans: { invalidate: invalidatePlans },
      records: { invalidate: invalidateLogs },
      statistics: { invalidate: invalidateStatistics },
    }),
    userSettings: {
      update: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { mutate: vi.fn(), isPending: false };
        },
      },
    },
  },
}));

describe('useUpdateUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getData.mockReturnValue({ timezone: 'UTC', showWeekNumbers: false });
  });

  it('onMutateでqueryをcancelしcacheを楽観更新する', async () => {
    renderHook(() => useUpdateUserSettings());

    const context = await mutationOptions.onMutate?.({ showWeekNumbers: true } as never);

    expect(cancel).toHaveBeenCalledOnce();
    expect(context).toEqual({ previous: { timezone: 'UTC', showWeekNumbers: false } });
    const updater = setData.mock.calls[0]?.[1] as (current: unknown) => unknown;
    expect(updater(getData())).toMatchObject({ showWeekNumbers: true });
  });

  it('onErrorでsnapshotへrollbackする', () => {
    renderHook(() => useUpdateUserSettings());
    const previous = { timezone: 'UTC', showWeekNumbers: false };

    mutationOptions.onError?.(new Error('failed') as never, {} as never, { previous } as never);

    expect(setData).toHaveBeenLastCalledWith(undefined, previous);
  });

  it('onSettledでsettingsを再検証しtimezone変更時はplans/logs/statisticsも無効化する', () => {
    renderHook(() => useUpdateUserSettings());

    mutationOptions.onSettled?.(
      undefined as never,
      undefined as never,
      {
        timezone: 'Asia/Tokyo',
      } as never,
    );

    expect(invalidateSettings).toHaveBeenCalledOnce();
    expect(invalidatePlans).toHaveBeenCalledOnce();
    expect(invalidateLogs).toHaveBeenCalledOnce();
    expect(invalidateStatistics).toHaveBeenCalledOnce();
  });
});
