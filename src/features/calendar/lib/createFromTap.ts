/**
 * Tag タップ即作成 — 純粋ヘルパー
 *
 * Sidebar / Mobile footer の tag タップで「最速即作成」する際の
 * start_time / end_time / duration 計算を担う。
 *
 * 採用アルゴリズム (OD-1 = α):
 * - start_time = now（秒・ms は 0 化、分粒度を保持）
 * - end_time = start_time + 最頻 duration（同タグ過去 entry の mode、無ければ 30 分）
 *
 * 設計意図:
 * - React/DOM 依存ゼロ。caller が `recentDurations` を集めてくるだけで動く
 * - 実装が trivial なので新規 store / hook は作らない
 *
 * @see docs/design/timeline-precision-redesign/overview.md OD-1 / Project B
 */

/** 履歴が無い時の duration フォールバック（分） */
export const DEFAULT_TAP_DURATION_MINUTES = 30;

/**
 * 配列の最頻値を返す。tie の場合は最初に登場したものを返す。
 * 要素なしなら null。
 */
export function modeOf<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  let bestValue: T = values[0]!;
  let bestCount = 0;
  for (const v of values) {
    const next = (counts.get(v) ?? 0) + 1;
    counts.set(v, next);
    if (next > bestCount) {
      bestValue = v;
      bestCount = next;
    }
  }
  return bestValue;
}

/**
 * 同タグ過去 entry の duration（分）配列から最頻 duration を推定。
 *
 * 0 以下や非有限値は除外。0 件なら DEFAULT_TAP_DURATION_MINUTES。
 */
export function inferTapDurationMinutes(durationsMinutes: readonly number[]): number {
  const valid = durationsMinutes.filter((d) => Number.isFinite(d) && d > 0);
  return modeOf(valid) ?? DEFAULT_TAP_DURATION_MINUTES;
}

/**
 * Tag タップ即作成 entry の time range を計算（α アルゴリズム）。
 *
 * - start = `now` の秒・ms を 0 化したもの（分粒度を保持）
 * - end = start + duration
 *
 * @returns ISO 8601 文字列の start / end ペア
 */
export function computeTapEntryTimeRange(
  now: Date,
  durationMinutes: number,
): { startISO: string; endISO: string } {
  const start = new Date(now);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

/**
 * entries の {start_time, end_time} ペアから duration（分）配列を抽出。
 *
 * - start / end が null の entry は除外
 * - duration_minutes フィールドが指定されていればそれを優先
 * - 0 以下の duration は除外
 */
export function extractDurationMinutes(
  entries: ReadonlyArray<{
    start_time: string | null;
    end_time: string | null;
    duration_minutes?: number | null;
  }>,
): number[] {
  const out: number[] = [];
  for (const e of entries) {
    if (e.duration_minutes != null && e.duration_minutes > 0) {
      out.push(e.duration_minutes);
      continue;
    }
    if (!e.start_time || !e.end_time) continue;
    const startMs = new Date(e.start_time).getTime();
    const endMs = new Date(e.end_time).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const minutes = Math.round((endMs - startMs) / 60_000);
    if (minutes > 0) out.push(minutes);
  }
  return out;
}
