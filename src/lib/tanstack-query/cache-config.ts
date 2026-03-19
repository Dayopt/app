/**
 * TanStack Queryのキャッシュ戦略設定
 *
 * 機能ごとに適切なstaleTime/gcTimeを定義
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/caching
 */

/**
 * リアルタイム性が重要なデータ
 * - イベント（カレンダー表示）
 * - カレンダー（同期重要）
 *
 * Supabase Realtime購読により常に最新データを保持
 * staleTime=5分: Realtime経由の更新は即座に反映されるため、長めに設定して再フェッチを抑制
 * gcTime=10分: ナビゲーション時のキャッシュ活用のため長めに設定
 */
export const realtimeCache = {
  staleTime: 5 * 60 * 1000, // 5分（Realtime購読で更新されるため長めでOK）
  gcTime: 10 * 60 * 1000, // 10分（前後の期間をキャッシュ保持）
};

/**
 * 通常のデータ（標準）
 * - タグ（頻繁に変更されない）
 * - タグ関連付け
 */
export const standardCache = {
  staleTime: 5 * 60 * 1000, // 5分
  gcTime: 10 * 60 * 1000, // 10分
};

/**
 * めったに変更されないデータ
 * - ユーザー設定
 * - システム設定
 */
export const staticCache = {
  staleTime: 60 * 60 * 1000, // 1時間
  gcTime: 2 * 60 * 60 * 1000, // 2時間
};

/**
 * 短期キャッシュ（1分）
 * - タグ使用数（頻繁に更新される可能性）
 * - プランアクティビティ（履歴は少し遅れてもOK）
 */
export const shortTermCache = {
  staleTime: 60 * 1000, // 1分
  gcTime: 5 * 60 * 1000, // 5分
};

/**
 * 機能別のキャッシュ戦略マトリクス
 */
export const cacheStrategies = {
  events: realtimeCache,
  calendars: realtimeCache,
  calendarViewState: standardCache, // ビュー状態はリアルタイム不要
  tags: standardCache,
  tagGroups: standardCache, // タググループは頻繁に変更されない
  itemTags: standardCache,
  tagStats: standardCache,
  tagUsage: shortTermCache, // タグ使用数は頻繁に更新される
  userSettings: staticCache,
  plans: realtimeCache, // プランはリアルタイム性が重要
  planActivities: shortTermCache, // アクティビティ履歴は少し遅れてもOK
  recordActivities: shortTermCache, // レコードアクティビティ履歴
  records: realtimeCache, // レコードもリアルタイム性が重要（カレンダー表示）
  entries: realtimeCache, // エントリ（plans+records統合）もリアルタイム性が重要
  sessions: realtimeCache, // セッションもリアルタイム性が重要
  notifications: shortTermCache, // 通知はリアルタイム性が重要だが、短期キャッシュで十分
  profile: staticCache, // プロフィールはめったに変更されない
} as const;

/**
 * 機能名からキャッシュ戦略（staleTime/gcTime）を取得する
 * @param feature cacheStrategiesのキー
 * @returns キャッシュ設定オブジェクト
 */
export function getCacheStrategy(feature: keyof typeof cacheStrategies) {
  return cacheStrategies[feature];
}
