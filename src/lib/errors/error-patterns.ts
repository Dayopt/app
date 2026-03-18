/**
 * 🚨 Dayopt エラーパターン辞書システム
 *
 * Issue #338: 技術知識不要の開発環境構築
 * Issue #350: エラーパターン辞書システム実装
 *
 * 機能:
 * - エラーコード→メッセージマッピング（7分野完全対応）
 * - 自動エラーハンドリング
 * - ユーザーフレンドリーメッセージ統一
 * - 技術知識不要のエラー理解支援
 */

import type { ErrorCode, ErrorLevel } from './error-codes';
import { ERROR_CODES } from './error-codes';

// ERROR_CODESとErrorCodeを再エクスポート
export { ERROR_CODES } from './error-codes';
export type { ErrorCode, ErrorLevel } from './error-codes';

// ==============================================
// エラーメッセージ統一システム
// ==============================================

export interface ErrorPattern {
  /** 技術者向けメッセージ */
  technical: string;
  /** ユーザーフレンドリーメッセージ */
  userFriendly: string;
  /** 短縮メッセージ（トースト等用） */
  short: string;
  /** 詳細説明（必要に応じて） */
  description: string;
  /** 推奨アクション */
  recommendedActions: string[];
  /** 自動復旧可能か */
  autoRecoverable: boolean;
  /** 緊急度レベル */
  urgency: ErrorLevel;
  /** 絵文字アイコン */
  emoji: string;
  /** 関連するFAQ ID（将来の拡張用） */
  faqIds?: string[];
}

// ==============================================
// 1000番台: 認証・セキュリティ系エラーパターン
// ==============================================

const AUTH_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.AUTH_INVALID_TOKEN]: {
    technical: '認証トークンが無効または破損しています',
    userFriendly: 'ログインの有効期限が切れました',
    short: 'ログインが必要です',
    description: 'セキュリティのため、定期的にログインし直していただく必要があります。',
    recommendedActions: [
      '「ログイン」ボタンをクリック',
      'メールアドレスとパスワードを入力',
      'ログイン後、元の画面に自動で戻ります',
    ],
    autoRecoverable: false,
    urgency: 'error',
    emoji: '🔐',
    faqIds: ['auth-001'],
  },

  [ERROR_CODES.AUTH_EXPIRED]: {
    technical: '認証セッションの有効期限が切れています',
    userFriendly: 'セッションの有効期限が切れました',
    short: '再ログインが必要です',
    description: '安全のため、一定時間操作がないとログインが切れる仕組みになっています。',
    recommendedActions: [
      '画面の「再ログイン」ボタンをクリック',
      '作業中のデータは自動保存されています',
      'ログイン後、続きから作業できます',
    ],
    autoRecoverable: false,
    urgency: 'warning',
    emoji: '⏰',
    faqIds: ['auth-002'],
  },

  [ERROR_CODES.AUTH_NO_PERMISSION]: {
    technical: '必要な権限が不足しています',
    userFriendly: 'この機能を使用する権限がありません',
    short: 'アクセス権限がありません',
    description: 'この機能は特定の役割を持つユーザーのみが利用できます。',
    recommendedActions: [
      '管理者にアクセス権限の申請を依頼',
      '別の方法で同じ目的を達成できないか確認',
      'ヘルプデスクにお問い合わせ',
    ],
    autoRecoverable: false,
    urgency: 'warning',
    emoji: '🚫',
    faqIds: ['auth-003'],
  },

  [ERROR_CODES.AUTH_SESSION_TIMEOUT]: {
    technical: 'セッションがタイムアウトしました',
    userFriendly: '操作時間が長すぎたため、セッションが切れました',
    short: 'セッションタイムアウト',
    description: 'セキュリティのため、長時間操作がないとセッションが自動終了します。',
    recommendedActions: [
      '「続行」ボタンをクリック',
      '再度ログイン',
      '今後は定期的に画面を操作してください',
    ],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '⏳',
  },

  [ERROR_CODES.AUTH_LOGIN_FAILED]: {
    technical: 'ログイン認証に失敗しました',
    userFriendly: 'メールアドレスまたはパスワードが間違っています',
    short: 'ログイン失敗',
    description: '入力されたログイン情報が正しくありません。',
    recommendedActions: [
      'メールアドレスの入力内容を確認',
      'パスワードの大文字小文字を確認',
      'パスワードを忘れた場合は「パスワードリセット」をクリック',
    ],
    autoRecoverable: false,
    urgency: 'error',
    emoji: '❌',
    faqIds: ['auth-004'],
  },
};

// ==============================================
// 2000番台: API・ネットワーク系エラーパターン
// ==============================================

const API_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.API_RATE_LIMIT]: {
    technical: 'APIレート制限に達しました',
    userFriendly: '短時間で多くの操作を行ったため、一時的に制限されています',
    short: '操作制限中',
    description: 'システム保護のため、短時間での大量操作は制限されています。',
    recommendedActions: [
      '1-2分お待ちください',
      '「再試行」ボタンが表示されたらクリック',
      '今後はゆっくりと操作してください',
    ],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '🚦',
  },

  [ERROR_CODES.API_INVALID_PARAM]: {
    technical: '無効なAPIパラメータが送信されました',
    userFriendly: '送信された情報に不備があります',
    short: '入力データエラー',
    description: '入力された情報の形式や内容に問題があります。',
    recommendedActions: [
      '入力内容を再度確認してください',
      '必須項目が全て入力されているか確認',
      '文字数制限を超えていないか確認',
    ],
    autoRecoverable: false,
    urgency: 'error',
    emoji: '📝',
  },

  [ERROR_CODES.API_SERVER_ERROR]: {
    technical: 'サーバー内部エラーが発生しました',
    userFriendly: 'サーバーで問題が発生しています',
    short: 'サーバーエラー',
    description: 'システム側で一時的な問題が発生しています。',
    recommendedActions: [
      '少し時間をおいて再試行',
      '問題が続く場合はサポートに連絡',
      '重要なデータは別途保存しておく',
    ],
    autoRecoverable: true,
    urgency: 'error',
    emoji: '🔧',
  },

  [ERROR_CODES.API_TIMEOUT]: {
    technical: 'API接続がタイムアウトしました',
    userFriendly: '応答に時間がかかりすぎています',
    short: '接続タイムアウト',
    description: 'ネットワークの状況や処理の重さにより、応答が遅くなっています。',
    recommendedActions: [
      'インターネット接続を確認',
      '「再試行」ボタンをクリック',
      '時間をおいて再度お試しください',
    ],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '⏱️',
  },
};

// ==============================================
// 3000番台: データ・データベース系エラーパターン
// ==============================================

const DATA_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.DATA_NOT_FOUND]: {
    technical: '指定されたデータが見つかりません',
    userFriendly: '探している情報が見つかりません',
    short: 'データなし',
    description: '要求された情報が削除されているか、アクセス権限がない可能性があります。',
    recommendedActions: [
      'ホーム画面から改めて探す',
      'ページを更新してみる',
      '削除されている可能性を確認',
    ],
    autoRecoverable: false,
    urgency: 'info',
    emoji: '🔍',
  },

  [ERROR_CODES.DATA_DUPLICATE]: {
    technical: '重複データの作成が試行されました',
    userFriendly: '同じ内容のデータが既に存在しています',
    short: '重複データ',
    description: 'システム内に同一の情報が既に登録されています。',
    recommendedActions: [
      '既存のデータを確認・編集',
      '異なる名前や内容に変更',
      '既存データの削除が必要な場合は管理者に相談',
    ],
    autoRecoverable: false,
    urgency: 'warning',
    emoji: '📋',
  },

  [ERROR_CODES.DATA_VALIDATION_ERROR]: {
    technical: 'データ検証エラーが発生しました',
    userFriendly: '入力された情報の形式が正しくありません',
    short: '入力形式エラー',
    description: '入力規則に合わない情報が含まれています。',
    recommendedActions: [
      '入力形式の例を参考に修正',
      '必須項目の入力漏れを確認',
      '文字数や形式の制限を確認',
    ],
    autoRecoverable: false,
    urgency: 'error',
    emoji: '⚠️',
  },
};

// ==============================================
// 4000番台: UI・フロントエンド系エラーパターン
// ==============================================

const UI_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.UI_COMPONENT_ERROR]: {
    technical: 'UIコンポーネントでエラーが発生しました',
    userFriendly: '画面の表示に問題が発生しました',
    short: '画面表示エラー',
    description: '画面の一部が正しく表示されていない可能性があります。',
    recommendedActions: [
      'ページを再読み込み',
      'ブラウザのキャッシュをクリア',
      '他のブラウザで試してみる',
    ],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '🖥️',
  },

  [ERROR_CODES.UI_RENDER_ERROR]: {
    technical: 'レンダリングエラーが発生しました',
    userFriendly: '画面の描画で問題が発生しました',
    short: '描画エラー',
    description: '画面の表示処理で予期しない問題が発生しました。',
    recommendedActions: ['ページを更新してみる', '一度戻って再度アクセス', 'ブラウザを再起動'],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '🎨',
  },
};

// ==============================================
// 5000番台: システム・インフラ系エラーパターン
// ==============================================

const SYSTEM_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.SYSTEM_NETWORK_ERROR]: {
    technical: 'ネットワーク接続エラーが発生しました',
    userFriendly: 'インターネット接続に問題があります',
    short: 'ネットワークエラー',
    description: 'インターネット接続が不安定になっているか、切断されています。',
    recommendedActions: [
      'Wi-Fi接続を確認',
      'モバイルデータの場合は電波状況を確認',
      'ルーターの再起動を試す',
    ],
    autoRecoverable: true,
    urgency: 'error',
    emoji: '📡',
  },

  [ERROR_CODES.SYSTEM_CONFIG_ERROR]: {
    technical: 'システム設定エラーが発生しました',
    userFriendly: 'システム設定に問題があります',
    short: '設定エラー',
    description: 'システムの設定に問題があり、正常に動作できません。',
    recommendedActions: [
      'サポートチームに連絡',
      '管理者にシステム設定の確認を依頼',
      '一時的に別の機能を利用',
    ],
    autoRecoverable: false,
    urgency: 'critical',
    emoji: '⚙️',
  },
};

// ==============================================
// 6000番台: ビジネスロジック系エラーパターン
// ==============================================

const BUSINESS_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.BUSINESS_RULE_VIOLATION]: {
    technical: 'ビジネスルールに違反しています',
    userFriendly: '業務ルールに合わない操作です',
    short: 'ルール違反',
    description: '設定されている業務ルールに適合しない操作を実行しようとしています。',
    recommendedActions: [
      '操作手順を確認',
      '管理者にルールの確認を依頼',
      'ヘルプドキュメントを参照',
    ],
    autoRecoverable: false,
    urgency: 'warning',
    emoji: '📋',
  },
};

// ==============================================
// 7000番台: 外部サービス連携系エラーパターン
// ==============================================

const EXTERNAL_ERROR_PATTERNS: Record<number, ErrorPattern> = {
  [ERROR_CODES.EXTERNAL_API_CONNECTION]: {
    technical: '外部API接続エラーが発生しました',
    userFriendly: '外部サービスとの接続で問題が発生しました',
    short: '外部サービスエラー',
    description: '連携している外部サービスで一時的な問題が発生しています。',
    recommendedActions: [
      '時間をおいて再試行',
      '外部サービスの状況を確認',
      '別の方法での作業を検討',
    ],
    autoRecoverable: true,
    urgency: 'warning',
    emoji: '🔗',
  },

  [ERROR_CODES.EXTERNAL_SERVICE_MAINTENANCE]: {
    technical: '外部サービスがメンテナンス中です',
    userFriendly: '連携サービスがメンテナンス中のため利用できません',
    short: 'メンテナンス中',
    description: '連携している外部サービスが定期メンテナンスを実施中です。',
    recommendedActions: [
      'メンテナンス終了まで待機',
      '代替機能があるかサポートに確認',
      'メンテナンス予定をお知らせで確認',
    ],
    autoRecoverable: false,
    urgency: 'info',
    emoji: '🔧',
  },
};

// ==============================================
// エラーパターン統合辞書
// ==============================================

export const ERROR_PATTERNS: Record<number, ErrorPattern> = {
  ...AUTH_ERROR_PATTERNS,
  ...API_ERROR_PATTERNS,
  ...DATA_ERROR_PATTERNS,
  ...UI_ERROR_PATTERNS,
  ...SYSTEM_ERROR_PATTERNS,
  ...BUSINESS_ERROR_PATTERNS,
  ...EXTERNAL_ERROR_PATTERNS,
};

// ==============================================
// ユーザーフレンドリーメッセージ生成
// ==============================================

/**
 * エラーコードから適切なメッセージを取得
 */
export function getErrorPattern(errorCode: ErrorCode): ErrorPattern | null {
  return ERROR_PATTERNS[errorCode] || null;
}

/**
 * エラーからユーザーフレンドリーメッセージを生成
 */
export function getUserFriendlyMessage(error: Error | ErrorCode, context?: string): string {
  let pattern: ErrorPattern | null = null;

  if (typeof error === 'number') {
    pattern = getErrorPattern(error);
  } else {
    // Error オブジェクトからエラーコードを推測
    const estimatedCode = estimateErrorCode(error);
    if (estimatedCode) {
      pattern = getErrorPattern(estimatedCode);
    }
  }

  if (!pattern) {
    return '予期しない問題が発生しました。しばらく待ってから再試行してください。';
  }

  // コンテキストに応じてメッセージを調整
  if (context === 'toast') {
    return `${pattern.emoji} ${pattern.short}`;
  }

  return pattern.userFriendly;
}

/**
 * 推奨アクションを取得
 */
export function getRecommendedActions(errorCode: ErrorCode): string[] {
  const pattern = getErrorPattern(errorCode);
  return pattern?.recommendedActions || ['ページを再読み込みしてみてください'];
}

/**
 * エラーの自動復旧可能性を判定
 */
export function isAutoRecoverable(errorCode: ErrorCode): boolean {
  const pattern = getErrorPattern(errorCode);
  return pattern?.autoRecoverable || false;
}

// ==============================================
// エラーパターン推定システム
// ==============================================

/**
 * Error オブジェクトからエラーコードを推定
 */
function estimateErrorCode(error: Error): ErrorCode | null {
  const message = error.message.toLowerCase();

  // 認証関連
  if (message.includes('auth') || message.includes('unauthorized') || message.includes('401')) {
    if (message.includes('expired') || message.includes('timeout')) {
      return ERROR_CODES.AUTH_EXPIRED;
    }
    if (message.includes('invalid') || message.includes('token')) {
      return ERROR_CODES.AUTH_INVALID_TOKEN;
    }
    if (message.includes('forbidden') || message.includes('403')) {
      return ERROR_CODES.AUTH_NO_PERMISSION;
    }
    return ERROR_CODES.AUTH_INVALID_TOKEN;
  }

  // ネットワーク関連
  if (message.includes('network') || message.includes('fetch')) {
    return ERROR_CODES.SYSTEM_NETWORK_ERROR;
  }

  // API関連
  if (message.includes('429') || message.includes('rate limit')) {
    return ERROR_CODES.API_RATE_LIMIT;
  }
  if (message.includes('timeout')) {
    return ERROR_CODES.API_TIMEOUT;
  }
  if (message.includes('500') || message.includes('server error')) {
    return ERROR_CODES.API_SERVER_ERROR;
  }

  // データ関連
  if (message.includes('not found') || message.includes('404')) {
    return ERROR_CODES.DATA_NOT_FOUND;
  }
  if (message.includes('duplicate') || message.includes('already exists')) {
    return ERROR_CODES.DATA_DUPLICATE;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ERROR_CODES.DATA_VALIDATION_ERROR;
  }

  // UI関連
  if (message.includes('component') || message.includes('render')) {
    return ERROR_CODES.UI_COMPONENT_ERROR;
  }

  return null;
}

// ==============================================
// エラーメッセージ統一ヘルパー
// ==============================================

/**
 * 統一されたエラートーストメッセージ生成
 */
export function createErrorToast(
  error: Error | ErrorCode,
  customMessage?: string,
): {
  message: string;
  emoji: string;
  duration: number;
  type: 'error' | 'warning' | 'info';
} {
  if (customMessage) {
    return {
      message: customMessage,
      emoji: '⚠️',
      duration: 5000,
      type: 'error',
    };
  }

  const pattern = typeof error === 'number' ? getErrorPattern(error) : null;
  const estimated = typeof error !== 'number' ? estimateErrorCode(error) : null;
  const finalPattern = pattern || (estimated ? getErrorPattern(estimated) : null);

  if (!finalPattern) {
    return {
      message: '予期しないエラーが発生しました',
      emoji: '❌',
      duration: 5000,
      type: 'error',
    };
  }

  return {
    message: finalPattern.short,
    emoji: finalPattern.emoji,
    duration: finalPattern.urgency === 'critical' ? 8000 : 5000,
    type:
      finalPattern.urgency === 'info'
        ? 'info'
        : finalPattern.urgency === 'warning'
          ? 'warning'
          : 'error',
  };
}

/**
 * デベロッパー向け詳細エラー情報取得
 */
export function getDetailedErrorInfo(errorCode: ErrorCode): {
  technical: string;
  userFriendly: string;
  actions: string[];
  recoverable: boolean;
  urgency: ErrorLevel;
} | null {
  const pattern = getErrorPattern(errorCode);

  if (!pattern) {
    return null;
  }

  return {
    technical: pattern.technical,
    userFriendly: pattern.userFriendly,
    actions: pattern.recommendedActions,
    recoverable: pattern.autoRecoverable,
    urgency: pattern.urgency,
  };
}

// ==============================================
// AppError クラス
// ==============================================

export interface AppErrorMetadata {
  [key: string]: unknown;
  userId?: string;
  requestId?: string;
  timestamp?: Date;
  userAgent?: string;
  ip?: string;
}

export type ErrorCategory = 'AUTH' | 'VALIDATION' | 'DB' | 'BIZ' | 'EXTERNAL' | 'SYSTEM' | 'RATE';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: SeverityLevel;
  public readonly userMessage: string;
  public readonly metadata: AppErrorMetadata;

  constructor(
    message: string,
    code: ErrorCode | string,
    metadata: AppErrorMetadata = {},
    userMessage?: string,
  ) {
    super(message);
    this.name = 'AppError';

    // 文字列コードを数値に変換
    this.code = typeof code === 'string' ? this.parseCodeFromString(code) : code;
    this.category = this.getCategoryFromCode(this.code);
    this.severity = this.getSeverityFromCode(this.code);
    this.userMessage = userMessage || this.getUserMessageFromCode(this.code);
    this.metadata = {
      ...metadata,
      timestamp: metadata.timestamp || new Date(),
    };

    // スタックトレースを適切に設定
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  private parseCodeFromString(codeString: string): ErrorCode {
    // 文字列からエラーコードを抽出 (例: "AUTH_INVALID_TOKEN" -> 1001)
    const codeMap: Record<string, ErrorCode> = {
      AUTH_INVALID_TOKEN: ERROR_CODES.AUTH_INVALID_TOKEN,
      AUTH_EXPIRED: ERROR_CODES.AUTH_EXPIRED,
      AUTH_NO_PERMISSION: ERROR_CODES.AUTH_NO_PERMISSION,
      SYSTEM_ERROR_500: ERROR_CODES.API_SERVER_ERROR,
      DATA_NOT_FOUND: ERROR_CODES.DATA_NOT_FOUND,
      VALIDATION_ERROR: ERROR_CODES.DATA_VALIDATION_ERROR,
    };

    return codeMap[codeString] || ERROR_CODES.API_SERVER_ERROR;
  }

  private getCategoryFromCode(code: ErrorCode): ErrorCategory {
    if (code >= 1000 && code < 2000) return 'AUTH';
    if (code >= 2000 && code < 3000) return 'EXTERNAL';
    if (code >= 3000 && code < 4000) return 'DB';
    if (code >= 4000 && code < 5000) return 'VALIDATION';
    if (code >= 5000 && code < 6000) return 'SYSTEM';
    if (code >= 6000 && code < 7000) return 'BIZ';
    if (code >= 7000 && code < 8000) return 'RATE';
    return 'SYSTEM';
  }

  private getSeverityFromCode(code: ErrorCode): SeverityLevel {
    const pattern = getErrorPattern(code);
    if (pattern?.urgency === 'critical') return 'critical';
    if (pattern?.urgency === 'error') return 'high';
    if (pattern?.urgency === 'warning') return 'medium';
    return 'low';
  }

  private getUserMessageFromCode(code: ErrorCode): string {
    const pattern = getErrorPattern(code);
    return pattern?.userFriendly || 'エラーが発生しました';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      userMessage: this.userMessage,
      metadata: this.metadata,
      stack: this.stack,
    };
  }
}

/**
 * AppError作成ヘルパー関数
 */
export function createAppError(
  message: string,
  code: ErrorCode | string,
  metadata?: AppErrorMetadata,
  userMessage?: string,
): AppError {
  return new AppError(message, code, metadata, userMessage);
}

// ==============================================
// ErrorPatternDictionary（index.ts互換エクスポート）
// ==============================================

// categories から re-export
export { getErrorCategory, type ErrorCategory as ErrorCategoryCode } from './categories';
