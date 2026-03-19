/**
 * エラーカテゴリ定義
 * 7つの主要カテゴリでエラーを分類し、適切なハンドリング戦略を提供
 */

/** エラーのカテゴリ定数マップ */
export const ERROR_CATEGORIES = {
  AUTH: 'AUTH',
  VALIDATION: 'VALIDATION',
  DB: 'DB',
  BIZ: 'BIZ',
  EXTERNAL: 'EXTERNAL',
  SYSTEM: 'SYSTEM',
  RATE: 'RATE',
} as const;

/** エラーカテゴリの型 */
export type ErrorCategory = (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES];

/**
 * エラーコード体系（カテゴリ別範囲）
 */
export const ERROR_CODE_RANGES = {
  AUTH: { start: 1000, end: 1999 },
  VALIDATION: { start: 2000, end: 2999 },
  DB: { start: 3000, end: 3999 },
  BIZ: { start: 4000, end: 4999 },
  EXTERNAL: { start: 5000, end: 5999 },
  SYSTEM: { start: 6000, end: 6999 },
  RATE: { start: 7000, end: 7999 },
} as const;

/**
 * 認証・認可エラー (1xxx)
 */
export const AUTH_ERROR_CODES = {
  INVALID_TOKEN: 1001,
  EXPIRED_TOKEN: 1002,
  NO_PERMISSION: 1003,
  INVALID_CREDENTIALS: 1004,
  ACCOUNT_LOCKED: 1005,
  SESSION_EXPIRED: 1006,
  INVALID_2FA: 1007,
  ACCOUNT_SUSPENDED: 1008,
  INVALID_API_KEY: 1009,
  INSUFFICIENT_SCOPE: 1010,
} as const;

/**
 * バリデーションエラー (2xxx)
 */
export const VALIDATION_ERROR_CODES = {
  REQUIRED_FIELD: 2001,
  INVALID_FORMAT: 2002,
  OUT_OF_RANGE: 2003,
  INVALID_EMAIL: 2004,
  INVALID_PASSWORD: 2005,
  PASSWORD_TOO_WEAK: 2006,
  INVALID_URL: 2007,
  INVALID_DATE: 2008,
  FILE_TOO_LARGE: 2009,
  INVALID_FILE_TYPE: 2010,
  DUPLICATE_VALUE: 2011,
  INVALID_ENUM: 2012,
} as const;

/**
 * データベースエラー (3xxx)
 */
export const DB_ERROR_CODES = {
  CONNECTION_FAILED: 3001,
  QUERY_TIMEOUT: 3002,
  CONSTRAINT_VIOLATION: 3003,
  NOT_FOUND: 3004,
  DUPLICATE_KEY: 3005,
  FOREIGN_KEY_VIOLATION: 3006,
  TRANSACTION_FAILED: 3007,
  DEADLOCK: 3008,
  CONNECTION_POOL_EXHAUSTED: 3009,
  MIGRATION_FAILED: 3010,
} as const;

/**
 * ビジネスロジックエラー (4xxx)
 */
export const BIZ_ERROR_CODES = {
  INSUFFICIENT_BALANCE: 4001,
  INVALID_OPERATION: 4002,
  RESOURCE_UNAVAILABLE: 4003,
  BUSINESS_RULE_VIOLATION: 4004,
  WORKFLOW_STATE_ERROR: 4005,
  QUOTA_EXCEEDED: 4006,
  INVALID_STATE_TRANSITION: 4007,
  DEPENDENCY_NOT_MET: 4008,
  RESOURCE_CONFLICT: 4009,
  OPERATION_NOT_ALLOWED: 4010,
} as const;

/**
 * 外部サービス連携エラー (5xxx)
 */
export const EXTERNAL_ERROR_CODES = {
  API_UNAVAILABLE: 5001,
  API_TIMEOUT: 5002,
  INVALID_API_RESPONSE: 5003,
  EXTERNAL_AUTH_FAILED: 5004,
  WEBHOOK_FAILED: 5005,
  PAYMENT_FAILED: 5006,
  EMAIL_SEND_FAILED: 5007,
  SMS_SEND_FAILED: 5008,
  FILE_UPLOAD_FAILED: 5009,
  THIRD_PARTY_ERROR: 5010,
} as const;

/**
 * システム・インフラエラー (6xxx)
 */
export const SYSTEM_ERROR_CODES = {
  INTERNAL_SERVER_ERROR: 6001,
  SERVICE_UNAVAILABLE: 6002,
  MEMORY_EXHAUSTED: 6003,
  DISK_SPACE_FULL: 6004,
  NETWORK_ERROR: 6005,
  CONFIGURATION_ERROR: 6006,
  DEPENDENCY_UNAVAILABLE: 6007,
  HEALTH_CHECK_FAILED: 6008,
  RESOURCE_EXHAUSTED: 6009,
  UNEXPECTED_ERROR: 6010,
} as const;

/**
 * レート制限エラー (7xxx)
 */
export const RATE_ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: 7001,
  QUOTA_EXCEEDED: 7002,
  REQUEST_TOO_FREQUENT: 7003,
  BURST_LIMIT_EXCEEDED: 7004,
  DAILY_LIMIT_EXCEEDED: 7005,
  MONTHLY_LIMIT_EXCEEDED: 7006,
  CONCURRENT_LIMIT_EXCEEDED: 7007,
  IP_RATE_LIMITED: 7008,
  USER_RATE_LIMITED: 7009,
  API_RATE_LIMITED: 7010,
} as const;

/**
 * 全エラーコードの統合
 */
export const ERROR_CODES = {
  ...AUTH_ERROR_CODES,
  ...VALIDATION_ERROR_CODES,
  ...DB_ERROR_CODES,
  ...BIZ_ERROR_CODES,
  ...EXTERNAL_ERROR_CODES,
  ...SYSTEM_ERROR_CODES,
  ...RATE_ERROR_CODES,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * エラーコードからカテゴリを判定する関数
 */
export function getErrorCategory(errorCode: number): ErrorCategory {
  if (errorCode >= 1000 && errorCode <= 1999) return ERROR_CATEGORIES.AUTH;
  if (errorCode >= 2000 && errorCode <= 2999) return ERROR_CATEGORIES.VALIDATION;
  if (errorCode >= 3000 && errorCode <= 3999) return ERROR_CATEGORIES.DB;
  if (errorCode >= 4000 && errorCode <= 4999) return ERROR_CATEGORIES.BIZ;
  if (errorCode >= 5000 && errorCode <= 5999) return ERROR_CATEGORIES.EXTERNAL;
  if (errorCode >= 6000 && errorCode <= 6999) return ERROR_CATEGORIES.SYSTEM;
  if (errorCode >= 7000 && errorCode <= 7999) return ERROR_CATEGORIES.RATE;

  throw new Error(`Invalid error code: ${errorCode}`);
}

/**
 * カテゴリ別の重要度レベル
 */
export const CATEGORY_SEVERITY = {
  [ERROR_CATEGORIES.AUTH]: 'high',
  [ERROR_CATEGORIES.VALIDATION]: 'medium',
  [ERROR_CATEGORIES.DB]: 'critical',
  [ERROR_CATEGORIES.BIZ]: 'medium',
  [ERROR_CATEGORIES.EXTERNAL]: 'medium',
  [ERROR_CATEGORIES.SYSTEM]: 'critical',
  [ERROR_CATEGORIES.RATE]: 'low',
} as const;

/** エラーの重要度レベル */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * カテゴリ別のリトライ可能性
 */
export const CATEGORY_RETRYABLE = {
  [ERROR_CATEGORIES.AUTH]: false,
  [ERROR_CATEGORIES.VALIDATION]: false,
  [ERROR_CATEGORIES.DB]: true,
  [ERROR_CATEGORIES.BIZ]: false,
  [ERROR_CATEGORIES.EXTERNAL]: true,
  [ERROR_CATEGORIES.SYSTEM]: true,
  [ERROR_CATEGORIES.RATE]: true,
} as const;
