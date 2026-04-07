/**
 * 予定 vs 記録 差分計算（Inspector用）
 *
 * actual-time-overlay.ts のカレンダー版と同じ符号規則:
 * - startDiffMin > 0 → 遅れて開始（unexecuted / 斜線ハッチ）
 * - startDiffMin < 0 → 早く開始（overtime / 点線）
 * - endDiffMin < 0   → 早く終了（unexecuted / 斜線ハッチ）
 * - endDiffMin > 0   → 遅く終了（overtime / 点線）
 */

export type DiffKind = 'unexecuted' | 'overtime' | 'none';

export interface TimeDiffResult {
  /** 開始差分の種類。unexecuted=遅れ, overtime=早め */
  topKind: DiffKind;
  /** 開始差分（分、符号付き: 正=遅れ, 負=早め） */
  startDiffMin: number;
  /** 終了差分の種類。unexecuted=早め, overtime=遅れ */
  bottomKind: DiffKind;
  /** 終了差分（分、符号付き: 正=超過, 負=早め） */
  endDiffMin: number;
  /** 予定分数 */
  plannedDuration: number;
  /** 実績分数 */
  actualDuration: number;
  /** actual - planned */
  totalDiffMin: number;
  /** actual が1つ以上入力されているか */
  hasActual: boolean;
}

/** HH:MM → 分に変換 */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * HH:MM 文字列から開始/終了の差分を計算
 *
 * actualStart/actualEnd が null の場合は予定通り（差分なし）として扱う。
 * 両方 null の場合は hasActual: false を返す。
 */
export function computeTimeDiff(
  plannedStart: string,
  plannedEnd: string,
  actualStart: string | null,
  actualEnd: string | null,
): TimeDiffResult {
  const hasActual = actualStart != null || actualEnd != null;

  const pStartMin = toMinutes(plannedStart);
  const pEndMin = toMinutes(plannedEnd);
  const aStartMin = actualStart != null ? toMinutes(actualStart) : pStartMin;
  const aEndMin = actualEnd != null ? toMinutes(actualEnd) : pEndMin;

  const plannedDuration = Math.max(0, pEndMin - pStartMin);
  const actualDuration = Math.max(0, aEndMin - aStartMin);

  // 開始差分
  const startDiffMin = aStartMin - pStartMin;
  let topKind: DiffKind = 'none';
  if (startDiffMin > 0) topKind = 'unexecuted';
  else if (startDiffMin < 0) topKind = 'overtime';

  // 終了差分
  const endDiffMin = aEndMin - pEndMin;
  let bottomKind: DiffKind = 'none';
  if (endDiffMin < 0) bottomKind = 'unexecuted';
  else if (endDiffMin > 0) bottomKind = 'overtime';

  return {
    topKind,
    startDiffMin,
    bottomKind,
    endDiffMin,
    plannedDuration,
    actualDuration,
    totalDiffMin: actualDuration - plannedDuration,
    hasActual,
  };
}
