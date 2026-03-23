/**
 * 新規作成エントリのID追跡（アニメーション用）
 *
 * モジュールレベルのSetで管理。DayColumnのキャッシュ更新再レンダー時に
 * 同期的にチェックするだけなのでリアクティビティ不要。
 */

const newIds = new Set<string>();

/** エントリIDを「新規作成」としてマーク */
export function markNew(id: string): void {
  newIds.add(id);
}

/** エントリIDが「新規作成」かどうか判定 */
export function isNewEntry(id: string): boolean {
  return newIds.has(id);
}

/** 「新規作成」マークを解除 */
export function clearNew(id: string): void {
  newIds.delete(id);
}

/** 一時IDを本番IDに置換（楽観的更新 → サーバー応答時） */
export function replaceNew(oldId: string, newId: string): void {
  newIds.delete(oldId);
  newIds.add(newId);
}
