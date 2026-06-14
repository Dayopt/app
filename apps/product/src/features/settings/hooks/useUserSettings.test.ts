import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserSettings } from './useUserSettings';

/**
 * I-03 characterization test（consumer hook の公開挙動）
 *
 * 目的: Phase 4（server-state store の TanStack Query 移行）の前に、
 * `useUserSettings` の「返り値の契約」と「hydration 前に timezone 依存の
 * apply（dispatchUserSettings）を発火しない」data integrity 境界を固定する。
 *
 * store 実装（Zustand）は移行で置き換わるため、store の内部状態ではなく
 * (1) 返り値の shape (2) query state → hydrated/isPaused/error の写像
 * (3) apply effect の発火条件、という移行後も維持されるべき契約を検証する。
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
const mockDispatchUserSettings = vi.fn();

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

vi.mock('@/features/calendar/stores/userSettings', () => ({
  dispatchUserSettings: (settings: unknown) => mockDispatchUserSettings(settings),
}));

// merge 元の 2 store は固定値を返す（返り値 shape の検証用）
vi.mock('@/features/calendar/stores/useCalendarSettingsStore', () => ({
  useCalendarSettingsStore: () => ({ timezone: 'Asia/Tokyo', weekStartsOn: 1 }),
}));
vi.mock('@/lib/stores/useUserPreferenceStore', () => ({
  useUserPreferenceStore: () => ({ dateFormat: 'yyyy/MM/dd' }),
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

  it('2 store を merge した settings を返す', () => {
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

describe('useUserSettings（data integrity: apply 発火条件）', () => {
  beforeEach(() => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'fetching', error: null };
    vi.clearAllMocks();
  });

  it('isPending 中は dispatchUserSettings（timezone 依存 apply）を発火しない', () => {
    mockQuery = { data: undefined, isPending: true, fetchStatus: 'fetching', error: null };
    renderHook(() => useUserSettings());
    expect(mockDispatchUserSettings).not.toHaveBeenCalled();
  });

  it('data 解決後は dbSettings を timezone 込みで store へ apply する', () => {
    mockQuery = { data: DB_SETTINGS, isPending: false, fetchStatus: 'idle', error: null };
    renderHook(() => useUserSettings());
    expect(mockDispatchUserSettings).toHaveBeenCalledTimes(1);
    expect(mockDispatchUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'America/New_York', weekStartsOn: 0 }),
    );
  });

  it('data=null（新規ユーザー）では apply せず defaults を維持する', () => {
    mockQuery = { data: null, isPending: false, fetchStatus: 'idle', error: null };
    renderHook(() => useUserSettings());
    expect(mockDispatchUserSettings).not.toHaveBeenCalled();
  });
});

describe('useUserSettings（saveSettings の楽観的更新契約）', () => {
  beforeEach(() => {
    mockQuery = { data: DB_SETTINGS, isPending: false, fetchStatus: 'idle', error: null };
    vi.clearAllMocks();
  });

  it('saveSettings は store を即時 dispatch し DB mutation を mutate する', () => {
    const { result } = renderHook(() => useUserSettings());
    // 初回 apply 分の dispatch をクリアしてから saveSettings を検証
    mockDispatchUserSettings.mockClear();

    result.current.saveSettings({ timezone: 'Europe/London' });

    expect(mockDispatchUserSettings).toHaveBeenCalledWith({ timezone: 'Europe/London' });
    expect(mockMutate).toHaveBeenCalledWith({ timezone: 'Europe/London' });
  });

  it('変更フィールドが無い場合は mutate しない', () => {
    const { result } = renderHook(() => useUserSettings());
    mockDispatchUserSettings.mockClear();

    result.current.saveSettings({});

    expect(mockMutate).not.toHaveBeenCalled();
  });
});
