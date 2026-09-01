/**
 * Storybook用モックデータプリセット
 *
 * Story間で共通のモックデータを集約。
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
    defaultView: 'week',
    hourHeightDensity: 'default',
    planRecordMode: 'both',
  },
} as const;

// ─────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────

export const PRESET_AUTH = {
  /** 認証済みユーザー（メール+パスワードで登録。useAuthStore.setState 用） */
  authenticated: {
    user: {
      id: 'mock-user-id',
      email: 'user@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
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
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2025-01-01T00:00:00Z',
      },
    } as never,
    loading: false,
    error: null,
  },
  /**
   * Google でのみ登録したユーザー（パスワードを持たない）。
   * パスワード前提の UI を出し分ける画面の検証に使う。
   */
  googleOnly: {
    user: {
      id: 'mock-user-google',
      email: 'user@gmail.com',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { full_name: 'Tomoya' },
      aud: 'authenticated',
      created_at: '2025-01-01T00:00:00Z',
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
