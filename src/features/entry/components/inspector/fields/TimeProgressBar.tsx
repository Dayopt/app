interface TimeProgressBarProps {
  /** 予定時間（分） */
  plannedMinutes: number;
  /** 実績時間（分） */
  actualMinutes: number;
}

/**
 * 予定に対する実績の達成度バー
 *
 * - <100%: 1セグメント destructive（予定より短い）
 * - =100%: 1セグメント success（ぴったり）
 * - >100%: 2セグメント — 予定分 success + 超過分 warning
 *   全体を実績時間にスケールして超過の度合いを可視化
 */
export function TimeProgressBar({ plannedMinutes, actualMinutes }: TimeProgressBarProps) {
  if (plannedMinutes <= 0) return null;

  const percentage = (actualMinutes / plannedMinutes) * 100;

  // 超過: 2セグメント（予定 + 超過）
  if (percentage > 100) {
    const plannedWidth = (plannedMinutes / actualMinutes) * 100;
    const overtimeWidth = 100 - plannedWidth;

    return (
      <div
        className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={actualMinutes}
        aria-valuemax={plannedMinutes}
      >
        <div
          className="bg-success h-full rounded-l-full transition-all"
          style={{ width: `${plannedWidth}%` }}
        />
        <div
          className="bg-warning h-full rounded-r-full transition-all"
          style={{ width: `${overtimeWidth}%` }}
        />
      </div>
    );
  }

  // ぴったり or 不足: 1セグメント
  const barColor = percentage === 100 ? 'bg-success' : 'bg-destructive';

  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={`h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-valuenow={actualMinutes}
        aria-valuemax={plannedMinutes}
      />
    </div>
  );
}
