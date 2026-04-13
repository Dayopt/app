/**
 * Storybook用モックデータプリセット
 *
 * Story間で共通のモックデータを集約。
 * テスト用ファクトリ（src/lib/test/factories/）と併用する。
 *
 * @example
 * import { PRESET_USER_SETTINGS, PRESET_AUTH } from '../../../.storybook/mocks/presets';
 *
 * const meta = {
 *   parameters: {
 *     trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
 *     storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
 *   },
 * } satisfies Meta;
 */

import { createMockTag } from '@/lib/test/factories';

// ─────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────

export const PRESET_TAGS = {
  /** 標準5タグ（Work, Learning, Life, Exercise, Hobby） */
  standard: [
    createMockTag({ id: 'tag-work', name: 'Work', color: 'blue', sort_order: 0 }),
    createMockTag({ id: 'tag-learning', name: 'Learning', color: 'green', sort_order: 1 }),
    createMockTag({ id: 'tag-life', name: 'Life', color: 'amber', sort_order: 2 }),
    createMockTag({ id: 'tag-exercise', name: 'Exercise', color: 'teal', sort_order: 3 }),
    createMockTag({ id: 'tag-hobby', name: 'Hobby', color: 'violet', sort_order: 4 }),
  ],
  /** 空状態 */
  empty: [],
} as const;

// ─────────────────────────────────────────────────────────
// User Settings
// ─────────────────────────────────────────────────────────

export const PRESET_USER_SETTINGS = {
  /** 標準設定（24h・Asia/Tokyo・月曜始まり） */
  default: {
    timezone: 'Asia/Tokyo',
    showUtcOffset: true,
    timeFormat: '24h' as const,
    dateFormat: 'yyyy/MM/dd',
    weekStartsOn: 1 as const,
    showWeekends: true,
    showWeekNumbers: false,
    defaultDuration: 60,
    snapInterval: 15 as const,
    defaultView: 'week',
    hourHeightDensity: 'default',
    planRecordMode: 'both',
    chronotype: {
      enabled: true,
      type: 'moderate_morning' as const,
      displayMode: 'background' as const,
      opacity: 0.15,
      customZones: null,
    },
  },
} as const;

// ─────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────

export const PRESET_AUTH = {
  /** 認証済みユーザー（useAuthStore.setState 用） */
  authenticated: {
    user: {
      id: 'mock-user-id',
      email: 'user@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2025-01-01T00:00:00Z',
    } as never,
    session: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'mock-user-id',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2025-01-01T00:00:00Z',
      },
    } as never,
    loading: false,
    error: null,
  },
  /** 未認証状態 */
  unauthenticated: {
    user: null,
    session: null,
    loading: false,
    error: null,
  },
  /** メールなしユーザー */
  noEmail: {
    user: {
      id: 'mock-user-no-email',
      email: undefined,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2025-01-01T00:00:00Z',
    } as never,
    loading: false,
    error: null,
  },
} as const;
