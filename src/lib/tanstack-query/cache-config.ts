/**
 * TanStack Queryのキャッシュ戦略設定
 *
 * 機能ごとに適切なstaleTime/gcTimeを定義
 * データ同期は refetchOnWindowFocus（タブ切り替え時）+ mutation後のinvalidate で実現
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/caching
 */

/**
 * アクティブデータ（頻繁にUIに表示されるデータ）
 * - エントリ（カレンダー表示）
 * - プラン・レコード
 *
 * staleTime=30秒: タブ切り替え時に30秒以上経過していれば自動再取得
 * gcTime=10分: ナビゲーション時のキャッシュ活用のため長めに設定
 */
export const activeCache = {
  staleTime: 30 * 1000, // 30秒
  gcTime: 10 * 60 * 1000, // 10分
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
  events: activeCache,
  calendars: activeCache,
  calendarViewState: standardCache, // ビュー状態は頻繁に変更されない
  tags: standardCache,
  tagGroups: standardCache, // タググループは頻繁に変更されない
  itemTags: standardCache,
  tagStats: standardCache,
  tagUsage: shortTermCache, // タグ使用数は頻繁に更新される
  userSettings: standardCache, // 全コールサイトで CACHE_5_MINUTES (5min) を使用しているため実態に合わせる
  plans: activeCache, // プランはカレンダー表示で重要
  planActivities: shortTermCache, // アクティビティ履歴は少し遅れてもOK
  recordActivities: shortTermCache, // レコードアクティビティ履歴
  records: activeCache, // レコードもカレンダー表示で重要
  entries: activeCache, // エントリ（plans+records統合）もカレンダー表示で重要
  sessions: activeCache,
  notifications: shortTermCache, // 通知は短期キャッシュで十分
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
