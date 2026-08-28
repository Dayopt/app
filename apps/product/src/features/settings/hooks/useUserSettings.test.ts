import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserSettings } from './useUserSettings';

/**
 * I-03 characterization test（consumer hook の公開挙動）
 *
 * query stateと公開APIの契約を固定する。
 */

// query 返り値をテストごとに差し替える
type QueryResult = {
  data: unknown;
  isPending: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  error: unknown;
};
let mockQuery: QueryResult = {
  data: undefined,
  isPending: true,
  fetchStatus: 'fetching',
  error: null,
};

const mockInvalidate = vi.fn();
const mockEntriesInvalidate = vi.fn();
const mockMutate = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/date', () => ({
  CACHE_5_MINUTES: 5 * 60 * 1000,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      userSettings: { get: { invalidate: mockInvalidate } },
      entries: { invalidate: mockEntriesInvalidate },
    }),
    userSettings: {
      get: {
        useQuery: () => mockQuery,
      },
      update: {
        useMutation: () => ({ mutate: mockMutate, isPending: false }),
      },
    },
  },
}));

// query-backedな2つのsettings hookは固定値を返す
// useUserSettings.ts は @/features/calendar の barrel 経由で import するため、
// 同じ barrel path を mock する(deep path を mock しても実装の import を捕捉できない)。
vi.mock('@/features/calendar', () => ({
  useCalendarSettings: () => ({
    defaultView: 'week',
    showWeekends: true,
    hourHeightDensity: 'default',
  }),
}));
vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    timezone: 'Asia/Tokyo',
    timeFormat: '24h',
    dateFormat: 'yyyy/MM/dd',
    weekStartsOn: 1,
    showWeekNumbers: false,
    defaultDuration: 60,
    snapInterval: 15,
  }),
}));

const DB_SETTINGS = {
  timezone: 'America/New_York',
  timeFormat: '24h',
  preferredLocale: 'en',
  weekStartsOn: 0,
  showWeekends: true,
  showWeekNumbers: false,
  defaultDuration: 30,
  snapInterval: 15,
  defaultView: 'week',
  hourHeightDensity: 'comfortable',
};

describe('useUserSettings（返り値の契約）', () => {
  beforeEach(() => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'fetching', error: null };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('公開する key の契約を維持する', () => {
    const { result } = renderHook(() => useUserSettings());
    expect(Object.keys(result.current).sort()).toEqual(
      ['error', 'hydrated', 'isPaused', 'isPending', 'isSaving', 'saveSettings', 'settings'].sort(),
    );
    expect(typeof result.current.saveSettings).toBe('function');
  });

  it('query preferencesとCalendar UI stateをmergeしたsettingsを返す', () => {
    mockQuery = { data: DB_SETTINGS, isPending: false, fetchStatus: 'idle', error: null };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.settings).toMatchObject({
      timezone: 'Asia/Tokyo',
      weekStartsOn: 1,
      dateFormat: 'yyyy/MM/dd',
    });
  });
});

describe('useUserSettings（query state → flag の写像）', () => {
  beforeEach(() => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'fetching', error: null };
    vi.clearAllMocks();
  });

  it('isPending 中は hydrated=false（gate が children を出さない state）', () => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'fetching', error: null };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.hydrated).toBe(false);
    expect(result.current.isPending).toBe(true);
  });

  it('data 解決後は hydrated=true', () => {
    mockQuery = { data: DB_SETTINGS, isPending: false, fetchStatus: 'idle', error: null };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.hydrated).toBe(true);
  });

  it('data=null（row なし新規ユーザー）でも hydrated=true（confirmed state として通過）', () => {
    mockQuery = { data: null, isPending: false, fetchStatus: 'idle', error: null };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.hydrated).toBe(true);
  });

  it('fetchStatus="paused" を isPaused=true に写像する', () => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'paused', error: null };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.isPaused).toBe(true);
  });

  it('error をそのまま passthrough する', () => {
    const err = new Error('load failed');
    mockQuery = { data: undefined, isPending: false, fetchStatus: 'idle', error: err };
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.error).toBe(err);
  });
});

describe('useUserSettings（saveSettings の楽観的更新契約）', () => {
  beforeEach(() => {
    mockQuery = { data: DB_SETTINGS, isPending: false, fetchStatus: 'idle', error: null };
    vi.clearAllMocks();
  });

  it('server settingはquery mutationだけを実行する', () => {
    const { result } = renderHook(() => useUserSettings());

    result.current.saveSettings({ timezone: 'Europe/London' });

    expect(mockMutate).toHaveBeenCalledWith({ timezone: 'Europe/London' });
  });

  it('Calendar settingも同じquery mutationを実行する', () => {
    const { result } = renderHook(() => useUserSettings());

    result.current.saveSettings({ showWeekends: false });

    expect(mockMutate).toHaveBeenCalledWith({ showWeekends: false });
  });

  it('変更フィールドが無い場合は mutate しない', () => {
    const { result } = renderHook(() => useUserSettings());

    result.current.saveSettings({});

    expect(mockMutate).not.toHaveBeenCalled();
  });
});
