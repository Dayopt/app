import type { EntryLike } from './entry-time-model';
import { getEffectiveActualRange, isAutoRecorded } from './entry-time-model';

/** 判定対象エントリ（cache の entries.list row 相当。id を持つ EntryLike）。 */
export type SkippableCandidate = EntryLike & { id: string };

/**
 * 新規の予定外記録（range）が衝突する相手が「完全に包含された自動記録だけ」なら、
 * スキップで一手解決できる entry ID 配列を返す。
 *
 * スキップで空くのは実績レイヤーのみなので:
 * - 新規が予定外記録（過去）でなければ対象外（`isUnplannedRecord`）。
 * - 確定済み実績との衝突や、部分重複の自動記録が混ざる場合は空配列を返す
 *   （実績トリムは Inspector に誘導する既存方針）。
 *
 * effective actual の判定は DB の entries_effective view と同義の
 * `getEffectiveActualRange` / `isAutoRecorded`（[[entry-time-model]]）に委ねる。
 */
export function findSkippableAutoRecords(params: {
  /** 新規記録の実績 range（ms epoch）。 */
  rangeStartMs: number;
  rangeEndMs: number;
  /** 新規エントリが予定外記録（過去）か。planned / 未来は対象外。 */
  isUnplannedRecord: boolean;
  /** 判定対象の既存エントリ群。 */
  candidates: SkippableCandidate[];
  /** effective actual 判定の基準時刻（テスト用に注入可能）。 */
  now?: Date;
}): string[] {
  if (!params.isUnplannedRecord) return [];
  if (!Number.isFinite(params.rangeStartMs) || !Number.isFinite(params.rangeEndMs)) return [];

  const skippable: string[] = [];
  for (const entry of params.candidates) {
    const range = getEffectiveActualRange(entry, params.now);
    if (!range) continue;

    const s = range.start.getTime();
    const e = range.end.getTime();
    // 重なりなし
    if (!(s < params.rangeEndMs && e > params.rangeStartMs)) continue;

    if (isAutoRecorded(entry, params.now) && s >= params.rangeStartMs && e <= params.rangeEndMs) {
      skippable.push(entry.id);
    } else {
      // 確定済み実績 or 部分重複の自動記録が混ざる → 一手では解決しない
      return [];
    }
  }
  return skippable;
}
