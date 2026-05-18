// 共有層が必要とするEntry関連の基本型
// Canonical source for types used by src/stores/, src/types/ (shared layer cannot import features)
// 完全なEntry型定義は @/features/entry/types/entry.ts を参照

/**
 * エントリの時間位置ベースの状態
 * - upcoming: 未来の予定
 * - active: 現在進行中
 * - past: 過去の記録
 */
export type EntryState = 'upcoming' | 'active' | 'past';

/**
 * エントリの起源
 * - planned: 計画済み（予定あり）
 * - unplanned: 計画外（記録のみ）
 */
export type EntryOrigin = 'planned' | 'unplanned';

/**
 * 充実度スコア（3段階）
 * 1: 微妙
 * 2: 普通
 * 3: 良い
 */
export type FulfillmentScore = 1 | 2 | 3;
