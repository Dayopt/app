/**
 * セッション管理設定
 *
 * OWASP推奨のセッション管理ベストプラクティスに準拠
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
 * @see Issue #487 - OWASP準拠のセキュリティ強化 Phase 2
 */

/**
 * セッション設定（秒単位）
 */
export const SESSION_CONFIG = {
  /**
   * セッションタイムアウト（30日）
   * - 一般的なカレンダーアプリに合わせて長めに設定
   */
  maxAge: 30 * 24 * 60 * 60, // 30日

  /**
   * アイドルタイムアウト（無効）
   * - カレンダーアプリでは不要なため無効化
   * - SessionMonitorProviderはセッション失効通知用に配置
   */
  idleTimeout: 30 * 24 * 60 * 60, // 実質無効（30日）

  /**
   * 絶対タイムアウト（30日）
   * - 一般的なカレンダーアプリに合わせて長めに設定
   */
  absoluteTimeout: 30 * 24 * 60 * 60, // 30日

  /**
   * Remember Me 機能（30日間）
   * - 一般的なアプリと同等の期間
   */
  rememberMeMaxAge: 30 * 24 * 60 * 60, // 30日

  /**
   * 同時セッション数の制限（無制限）
   * - 複数デバイスでの利用を制限しない
   */
  maxConcurrentSessions: 100, // 実質無制限

  /**
   * セッション更新間隔（5分）
   * - アクティビティ検出時のセッション延長間隔
   * - 頻繁すぎるとサーバー負荷、少なすぎるとUX悪化
   */
  refreshInterval: 5 * 60, // 300秒

  /**
   * セッションID再生成のタイミング
   */
  regenerateOn: {
    login: true, // ログイン時
    logout: true, // ログアウト時
    privilegeEscalation: true, // 権限昇格時
  },
} as const;

/**
 * Cookie設定
 */
export const COOKIE_CONFIG = {
  /**
   * セッションCookie名
   */
  sessionCookie: 'session',

  /**
   * Remember Me Cookie名
   */
  rememberMeCookie: 'remember_me',

  /**
   * Cookie属性
   */
  attributes: {
    httpOnly: true, // XSS対策: JavaScriptからアクセス不可
    secure: process.env.NODE_ENV === 'production', // HTTPS のみ
    sameSite: 'lax' as const, // CSRF対策
    path: '/',
  },
} as const;

/**
 * セッションセキュリティ設定
 */
export const SESSION_SECURITY = {
  /**
   * セッション固定攻撃対策
   * - ログイン成功時にセッションIDを再生成
   */
  preventSessionFixation: true,

  /**
   * セッションハイジャック対策
   * - User-Agent、IP addressの検証（オプション）
   */
  validateUserAgent: false, // プロキシ環境で問題になる可能性があるため無効
  validateIpAddress: false, // モバイル環境で問題になる可能性があるため無効

  /**
   * セッションタイムアウト警告
   * - タイムアウトN秒前に警告を表示
   */
  timeoutWarning: 5 * 60, // タイムアウト5分前

  /**
   * ログアウト後のリダイレクト
   */
  logoutRedirect: '/auth/login',

  /**
   * タイムアウト後のリダイレクト
   */
  timeoutRedirect: '/auth/login?reason=timeout',
} as const;

/**
 * セッションストレージ設定
 */
export const SESSION_STORAGE = {
  /**
   * ストレージタイプ
   * - 'cookie': Cookie only（小規模データ）
   * - 'database': Database（大規模データ、Supabase使用）
   */
  type: 'database' as const,

  /**
   * セッションデータの暗号化
   */
  encrypt: true,

  /**
   * セッションメタデータ
   */
  metadata: {
    trackLoginTime: true,
    trackLastActivity: true,
    trackIpAddress: true,
    trackUserAgent: true,
    trackDeviceId: true,
  },
} as const;

/**
 * 型定義
 */
export interface SessionData {
  userId: string;
  email: string;
  createdAt: number; // Unix timestamp
  lastActivity: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
  isRememberMe: boolean;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
  };
}

/**
 * セッション状態
 */
export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  IDLE_TIMEOUT = 'idle_timeout',
  ABSOLUTE_TIMEOUT = 'absolute_timeout',
  INVALIDATED = 'invalidated', // 手動無効化
  CONCURRENT_LIMIT = 'concurrent_limit', // 同時セッション制限
}

/**
 * セッション検証結果
 */
export interface SessionValidation {
  isValid: boolean;
  status: SessionStatus;
  remainingTime?: number; // 秒
  needsRefresh: boolean;
  message?: string;
}

/**
 * ヘルパー関数: セッションの有効性チェック
 */
export function validateSession(session: SessionData): SessionValidation {
  const now = Date.now();
  const createdAt = session.createdAt;
  const lastActivity = session.lastActivity;
  const expiresAt = session.expiresAt;

  // セッション期限切れ
  if (now > expiresAt) {
    return {
      isValid: false,
      status: SessionStatus.EXPIRED,
      needsRefresh: false,
      message: 'Session expired',
    };
  }

  // アイドルタイムアウト
  const idleTime = (now - lastActivity) / 1000;
  if (idleTime > SESSION_CONFIG.idleTimeout) {
    return {
      isValid: false,
      status: SessionStatus.IDLE_TIMEOUT,
      needsRefresh: false,
      message: 'Session idle timeout',
    };
  }

  // 絶対タイムアウト
  const absoluteTime = (now - createdAt) / 1000;
  if (absoluteTime > SESSION_CONFIG.absoluteTimeout) {
    return {
      isValid: false,
      status: SessionStatus.ABSOLUTE_TIMEOUT,
      needsRefresh: false,
      message: 'Session absolute timeout',
    };
  }

  // セッション更新が必要かチェック
  const timeSinceRefresh = (now - lastActivity) / 1000;
  const needsRefresh = timeSinceRefresh > SESSION_CONFIG.refreshInterval;

  const remainingTime = Math.min(
    expiresAt - now,
    SESSION_CONFIG.idleTimeout - idleTime,
    SESSION_CONFIG.absoluteTimeout - absoluteTime,
  );

  return {
    isValid: true,
    status: SessionStatus.ACTIVE,
    remainingTime: Math.floor(remainingTime),
    needsRefresh,
  };
}

/**
 * ヘルパー関数: セッションタイムアウト警告が必要かチェック
 */
export function shouldShowTimeoutWarning(session: SessionData): boolean {
  const validation = validateSession(session);

  if (!validation.isValid || !validation.remainingTime) {
    return false;
  }

  return validation.remainingTime <= SESSION_SECURITY.timeoutWarning;
}
