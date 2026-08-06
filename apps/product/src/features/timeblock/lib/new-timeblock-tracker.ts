/**
 * 新規作成エントリのID追跡（アニメーション用）
 *
 * モジュールレベルのSetで管理。エントリ表示コンポーネントのキャッシュ更新再レンダー時に
 * 同期的にチェックするだけなのでリアクティビティ不要。
 */

const newIds = new Set<string>();

/** Timeblock IDを「新規作成」としてマーク */
export function markNew(id: string): void {
  newIds.add(id);
}

/** Timeblock IDが「新規作成」かどうか判定 */
export function isNewTimeblock(id: string): boolean {
  return newIds.has(id);
}

/** 「新規作成」マークを解除 */
export function clearNew(id: string): void {
  newIds.delete(id);
}
