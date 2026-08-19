/**
 * 楽観的更新ユーティリティ
 *
 * tRPC mutationの楽観的更新パターンを簡素化するヘルパー関数
 *
 * @example
 * ```typescript
 * const mutation = api.activities.deleteActivity.useMutation({
 *   onMutate: async ({ id }) => {
 *     const snapshot = await createSnapshot(utils, [
 *       { query: utils.activities.listActivities, key: undefined },
 *     ]);
 *
 *     // 楽観的更新
 *     updateListCache(utils.activities.listActivities, undefined, (old) =>
 *       filterFromList(old, (item) => item.id !== id)
 *     );
 *
 *     return { snapshot };
 *   },
 *   onError: (_err, _input, context) => {
 *     context?.snapshot?.restore();
 *   },
 *   onSettled: () => {
 *     void utils.activities.listActivities.invalidate();
 *   },
 * });
 * ```
 */

// ========================================
// 型定義
// ========================================

/** ページネーション付きリストデータ（data配列＋総件数） */
export interface PaginatedList<T> {
  data: T[];
  count: number;
}

/** tRPCのキャッシュ操作インターフェース */
interface CacheOperations<TData, TInput = undefined> {
  cancel: (input?: TInput) => Promise<void>;
  getData: (input?: TInput) => TData | undefined;
  setData: (
    input: TInput,
    updater: TData | undefined | ((old: TData | undefined) => TData | undefined),
  ) => void;
  invalidate: (input?: TInput, options?: { refetchType?: 'active' | 'all' }) => Promise<void>;
}

/** スナップショットアイテム */
interface SnapshotItem<TData, TInput = undefined> {
  query: CacheOperations<TData, TInput>;
  key: TInput;
}

/** キャッシュスナップショットとロールバック関数を持つオブジェクト */
interface Snapshot {
  restore: () => void;
}

// ========================================
// スナップショット・ロールバック
// ========================================

/**
 * 複数クエリのスナップショットを作成し、ロールバック関数を返す
 *
 * @example
 * ```typescript
 * const snapshot = await createSnapshot(utils, [
 *   { query: utils.tags.list, key: undefined },
 *   { query: utils.activities.listActivities, key: undefined },
 * ]);
 *
 * // エラー時にロールバック
 * snapshot.restore();
 * ```
 */
export async function createSnapshot<T extends SnapshotItem<unknown, unknown>[]>(
  _utils: unknown,
  queries: T,
): Promise<Snapshot> {
  // 全クエリをキャンセル
  await Promise.all(queries.map((q) => q.query.cancel(q.key)));

  // スナップショットを取得
  const snapshots = queries.map((q) => ({
    query: q.query,
    key: q.key,
    data: q.query.getData(q.key),
  }));

  return {
    restore: () => {
      for (const snap of snapshots) {
        snap.query.setData(snap.key, snap.data);
      }
    },
  };
}

/**
 * 単一クエリのスナップショットを作成
 *
 * @example
 * ```typescript
 * const { previous, restore } = await snapshotQuery(utils.tags.list);
 * ```
 */
export async function snapshotQuery<TData, TInput = undefined>(
  query: CacheOperations<TData, TInput>,
  key?: TInput,
): Promise<{ previous: TData | undefined; restore: () => void }> {
  await query.cancel(key);
  const previous = query.getData(key);

  return {
    previous,
    restore: () => {
      // key は getData で使用した値と同じ型 — optional parameter の undefined 許容を吸収
      query.setData(key as TInput, previous);
    },
  };
}

// ========================================
// リスト操作ヘルパー（プレーンリスト用）
// ========================================

/**
 * プレーンリストからアイテムをフィルタリング
 *
 * @example
 * ```typescript
 * utils.plans.list.setData(undefined, (old) =>
 *   filterList(old, (plan) => plan.id !== deletedId)
 * );
 * ```
 */
export function filterList<T>(
  list: T[] | undefined,
  predicate: (item: T) => boolean,
): T[] | undefined {
  if (!list) return list;
  return list.filter(predicate);
}

/**
 * プレーンリストのアイテムを更新
 *
 * @example
 * ```typescript
 * utils.plans.list.setData(undefined, (old) =>
 *   updateList(old, (plan) =>
 *     plan.id === id ? { ...plan, title: newTitle } : plan
 *   )
 * );
 * ```
 */
export function updateList<T>(list: T[] | undefined, mapper: (item: T) => T): T[] | undefined {
  if (!list) return list;
  return list.map(mapper);
}

/**
 * プレーンリストにアイテムを追加
 *
 * @example
 * ```typescript
 * utils.plans.list.setData(undefined, (old) =>
 *   addToList(old, newPlan)
 * );
 * ```
 */
export function addToList<T>(
  list: T[] | undefined,
  item: T,
  position: 'start' | 'end' = 'end',
): T[] {
  if (!list) return [item];
  return position === 'start' ? [item, ...list] : [...list, item];
}

/**
 * プレーンリストからアイテムを削除
 *
 * @example
 * ```typescript
 * utils.plans.list.setData(undefined, (old) =>
 *   removeFromList(old, 'id', deletedId)
 * );
 * ```
 */
export function removeFromList<T, K extends keyof T>(
  list: T[] | undefined,
  key: K,
  value: T[K],
): T[] | undefined {
  if (!list) return list;
  return list.filter((item) => item[key] !== value);
}

// ========================================
// リスト操作ヘルパー（ページネーション付きリスト用）
// ========================================

/**
 * ページネーション付きリストからアイテムをフィルタリング
 *
 * @example
 * ```typescript
 * utils.tags.list.setData(undefined, (old) =>
 *   filterPaginatedList(old, (tag) => tag.id !== deletedId)
 * );
 * ```
 */
export function filterPaginatedList<T>(
  list: PaginatedList<T> | undefined,
  predicate: (item: T) => boolean,
): PaginatedList<T> | undefined {
  if (!list) return list;
  const filtered = list.data.filter(predicate);
  return {
    ...list,
    data: filtered,
    count: filtered.length,
  };
}

/**
 * ページネーション付きリストのアイテムを更新
 *
 * @example
 * ```typescript
 * utils.tags.list.setData(undefined, (old) =>
 *   updatePaginatedList(old, (tag) =>
 *     tag.id === id ? { ...tag, name: newName } : tag
 *   )
 * );
 * ```
 */
export function updatePaginatedList<T>(
  list: PaginatedList<T> | undefined,
  mapper: (item: T) => T,
): PaginatedList<T> | undefined {
  if (!list) return list;
  return {
    ...list,
    data: list.data.map(mapper),
  };
}

/**
 * ページネーション付きリストにアイテムを追加
 *
 * @example
 * ```typescript
 * utils.tags.list.setData(undefined, (old) =>
 *   addToPaginatedList(old, newTag, 'start')
 * );
 * ```
 */
export function addToPaginatedList<T>(
  list: PaginatedList<T> | undefined,
  item: T,
  position: 'start' | 'end' = 'end',
): PaginatedList<T> {
  if (!list) return { data: [item], count: 1 };
  return {
    ...list,
    data: position === 'start' ? [item, ...list.data] : [...list.data, item],
    count: list.count + 1,
  };
}

/**
 * ページネーション付きリストからアイテムを削除
 *
 * @example
 * ```typescript
 * utils.tags.list.setData(undefined, (old) =>
 *   removeFromPaginatedList(old, 'id', deletedId)
 * );
 * ```
 */
export function removeFromPaginatedList<T, K extends keyof T>(
  list: PaginatedList<T> | undefined,
  key: K,
  value: T[K],
): PaginatedList<T> | undefined {
  if (!list) return list;
  const filtered = list.data.filter((item) => item[key] !== value);
  return {
    ...list,
    data: filtered,
    count: list.count - 1,
  };
}

/**
 * ページネーション付きリスト内のアイテムを置換
 *
 * @example
 * ```typescript
 * utils.tags.list.setData(undefined, (old) =>
 *   replaceInPaginatedList(old, 'id', tempId, actualTag)
 * );
 * ```
 */
export function replaceInPaginatedList<T, K extends keyof T>(
  list: PaginatedList<T> | undefined,
  key: K,
  oldValue: T[K],
  newItem: T,
): PaginatedList<T> | undefined {
  if (!list) return list;
  return {
    ...list,
    data: list.data.map((item) => (item[key] === oldValue ? newItem : item)),
  };
}

// ========================================
// 一時ID生成
// ========================================

/**
 * 楽観的更新用の一時IDを生成
 *
 * @example
 * ```typescript
 * const tempId = generateTempId();
 * // => "temp-1234567890123"
 * ```
 */
export function generateTempId(prefix = 'temp'): string {
  return `${prefix}-${Date.now()}`;
}

/**
 * IDが一時IDかどうかを判定
 *
 * @example
 * ```typescript
 * isTempId('temp-1234567890123'); // true
 * isTempId('uuid-xxx-xxx'); // false
 * ```
 */
export function isTempId(id: string, prefix = 'temp'): boolean {
  return id.startsWith(`${prefix}-`);
}
