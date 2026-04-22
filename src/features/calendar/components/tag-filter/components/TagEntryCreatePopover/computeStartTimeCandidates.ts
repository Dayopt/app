/**
 * エントリ作成ポップアップの「開始時刻チップ」候補を算出する pure 関数。
 *
 * 候補 3 種（出力は Date | null、null は非表示）:
 * - **now**: 現在時刻。now-line 上に既存 entry (start ≤ now < end) があれば null
 * - **slot30**: 次の 30 分境界。`Math.ceil(now / 30min) * 30min`
 * - **nextFree**: now 以降で既存 entry に重ならない最初の時刻（entry 終了時刻を chain して辿る）
 *
 * 重複排除:
 * - `slot30 === now`（14:00:00 ジャスト等）→ slot30 = null
 * - `slot30 === nextFree` → nextFree = null
 * - `now === nextFree`（now が空いている = nextFree は same instant）→ nextFree = null
 *
 * 時刻比較はミリ秒精度（`getTime()`）。
 */

export interface EntryRange {
  start: Date;
  end: Date;
}

export interface StartTimeCandidates {
  now: Date | null;
  slot30: Date | null;
  nextFree: Date | null;
}

const THIRTY_MIN_MS = 30 * 60 * 1000;

/** now に被る entry があるか（start ≤ now < end） */
function isBlockingAt(now: Date, entries: EntryRange[]): boolean {
  const t = now.getTime();
  return entries.some((e) => e.start.getTime() <= t && t < e.end.getTime());
}

/** now から chain して「次の空き」時刻を求める。重なる entry があれば entry.end に進む */
function findNextFree(now: Date, entries: EntryRange[]): Date {
  const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime());
  let t = now.getTime();
  // 重なりが続く限り entry.end に進む。10 回チェーンしても収束しなければ安全停止
  for (let i = 0; i < 10; i += 1) {
    const blocking = sorted.find((e) => e.start.getTime() <= t && t < e.end.getTime());
    if (!blocking) break;
    t = blocking.end.getTime();
  }
  return new Date(t);
}

export function computeStartTimeCandidates(
  now: Date,
  existingEntries: EntryRange[],
): StartTimeCandidates {
  // now
  const nowValue: Date | null = isBlockingAt(now, existingEntries) ? null : new Date(now);

  // slot30: ceil(now / 30min) * 30min（now と一致する場合は dedup で null）
  const slot30Ms = Math.ceil(now.getTime() / THIRTY_MIN_MS) * THIRTY_MIN_MS;
  let slot30: Date | null = new Date(slot30Ms);
  if (slot30.getTime() === now.getTime()) slot30 = null;

  // nextFree: now からチェーンして最初の空き時刻
  let nextFree: Date | null = findNextFree(now, existingEntries);

  // dedup: nextFree === slot30 → nextFree null（3 番目を非表示）
  if (slot30 && nextFree.getTime() === slot30.getTime()) nextFree = null;
  // dedup: now === nextFree（now が空いている場合は nextFree が same instant になる）→ nextFree null
  if (nowValue && nextFree && nextFree.getTime() === nowValue.getTime()) nextFree = null;

  return { now: nowValue, slot30, nextFree };
}

/** HH:MM 形式のラベル（UI 表示用） */
export function formatTimeLabel(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
