/**
 * タグごとの duration raw サンプルを、ポップアップ UI が必要とする
 * candidates / bins / sampleSize / varianceFlag に集計する pure 関数。
 *
 * 仕様:
 * - 5 分 bucket にスナップ (Math.round)
 * - 候補は count 降順、tiebreak は durationMinutes 昇順、上位最大 3 件
 * - variance は sampleSize >= 10 のときのみ計算。閾値 std/mean > 0.6
 */

export interface DurationSample {
  entryId: string;
  durationMinutes: number;
  startedAt: string;
}

export interface DurationCandidate {
  durationMinutes: number;
  count: number;
}

export interface DurationBin {
  durationMinutes: number;
  count: number;
}

export interface DurationDistribution {
  candidates: DurationCandidate[];
  bins: DurationBin[];
  sampleSize: number;
  varianceFlag: boolean;
}

export const SNAP_MINUTES = 5;
export const MAX_CANDIDATES = 3;
export const VARIANCE_MIN_SAMPLES = 10;
export const VARIANCE_THRESHOLD = 0.6;
export const HISTOGRAM_MIN_SAMPLES = 10;

/** 5 分 bucket にスナップ（四捨五入）。0 分以下は 0 を返す */
export function snapToBucket(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function computeDurationDistribution(samples: DurationSample[]): DurationDistribution {
  const sampleSize = samples.length;

  const bucketCounts = new Map<number, number>();
  for (const sample of samples) {
    const snapped = snapToBucket(sample.durationMinutes);
    if (snapped <= 0) continue;
    bucketCounts.set(snapped, (bucketCounts.get(snapped) ?? 0) + 1);
  }

  const bins: DurationBin[] = [...bucketCounts.entries()]
    .map(([durationMinutes, count]) => ({ durationMinutes, count }))
    .sort((a, b) => a.durationMinutes - b.durationMinutes);

  const candidates: DurationCandidate[] = [...bins]
    .sort((a, b) => b.count - a.count || a.durationMinutes - b.durationMinutes)
    .slice(0, MAX_CANDIDATES);

  const varianceFlag = computeVarianceFlag(samples, sampleSize);

  return { candidates, bins, sampleSize, varianceFlag };
}

function computeVarianceFlag(samples: DurationSample[], sampleSize: number): boolean {
  if (sampleSize < VARIANCE_MIN_SAMPLES) return false;

  const durations = samples.map((s) => s.durationMinutes).filter((d) => d > 0);
  if (durations.length === 0) return false;

  const mean = durations.reduce((acc, d) => acc + d, 0) / durations.length;
  if (mean <= 0) return false;

  const variance = durations.reduce((acc, d) => acc + (d - mean) ** 2, 0) / durations.length;
  const std = Math.sqrt(variance);
  return std / mean > VARIANCE_THRESHOLD;
}
