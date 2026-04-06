'use client';

/**
 * 予定 vs 記録の差分バー表示（位置ベース）
 *
 * バー全幅 = 最も早い開始〜最も遅い終了の時間軸。
 * 左=早い、右=遅い で、各セグメントを位置に応じて配置する。
 *
 * - 早く始めた分: 左に点線ボーダー
 * - 遅く始めた分: 左にハッチ（pattern-hatch）
 * - 計画 ∩ 実績の重なり: タグ色（濃）
 * - 早く終わった分: 右にハッチ
 * - 遅く終わった分: 右に点線ボーダー
 */

import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/lib/tag-colors';
import { formatDurationDisplay } from '@/lib/time-utils';
import { cn } from '@/lib/utils';
import { computeTimeDiff } from '../../../lib/time-diff';

/** 差分（分）を "+30m" / "±0m" / "-15m" 形式にフォーマット */
function formatDiffBadge(diffMinutes: number): string {
  if (diffMinutes === 0) return '±0';
  const sign = diffMinutes > 0 ? '+' : '-';
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`;
  if (h > 0) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

interface TimeDiffBlockProps {
  /** 予定開始 "HH:MM" */
  plannedStart: string;
  /** 予定終了 "HH:MM" */
  plannedEnd: string;
  /** 実績開始 "HH:MM" (null = 予定通り) */
  actualStart: string | null;
  /** 実績終了 "HH:MM" (null = 予定通り) */
  actualEnd: string | null;
  /** タグの色名（EntryCard と同じ色でバーを描画） */
  tagColor?: string | null | undefined;
}

/** 予定 vs 記録の差分をサマリー + 位置ベース横バーで表示 */
export function TimeDiffBlock({
  plannedStart,
  plannedEnd,
  actualStart,
  actualEnd,
  tagColor,
}: TimeDiffBlockProps) {
  const t = useTranslations();
  const diff = computeTimeDiff(plannedStart, plannedEnd, actualStart, actualEnd);

  // actual が未入力 → 表示しない
  if (!diff.hasActual) return null;

  // 予定が0分 → 表示しない
  if (diff.plannedDuration <= 0) return null;

  const { plannedDuration, actualDuration, totalDiffMin, startDiffMin, endDiffMin } = diff;

  // タグ色の解決
  const colorClasses = getTagColorClasses(tagColor);

  // バッジの色（差分の意味を伝えるためセマンティックカラー維持）
  const badgeClass =
    totalDiffMin === 0
      ? 'bg-success-tint text-success'
      : totalDiffMin > 0
        ? 'bg-warning-tint text-warning'
        : 'bg-destructive-tint text-destructive';

  // --- 位置ベースのセグメント計算 ---
  // startDiffMin > 0 → 遅れて開始（左にハッチ）
  // startDiffMin < 0 → 早く開始（左に点線）
  // endDiffMin > 0   → 遅く終了（右に点線）
  // endDiffMin < 0   → 早く終了（右にハッチ）

  const earlyStartMin = startDiffMin < 0 ? Math.abs(startDiffMin) : 0; // 左に点線
  const lateStartMin = startDiffMin > 0 ? startDiffMin : 0; // 左にハッチ
  const lateEndMin = endDiffMin > 0 ? endDiffMin : 0; // 右に点線
  const earlyEndMin = endDiffMin < 0 ? Math.abs(endDiffMin) : 0; // 右にハッチ

  // 重なり部分 = 計画の中で実際に実行された区間
  const overlapMin = plannedDuration - lateStartMin - earlyEndMin;

  // バー全幅 = 最も早い開始〜最も遅い終了
  const totalSpan = earlyStartMin + plannedDuration + lateEndMin;

  // 各セグメントの幅（%）
  const pct = (min: number) => (min / totalSpan) * 100;

  // aria-label
  const ariaLabel = `${t('entry.inspector.time.planned')} ${formatDurationDisplay(plannedDuration)} / ${t('entry.inspector.time.actual')} ${formatDurationDisplay(actualDuration)}`;

  return (
    <div className="flex flex-col gap-1" role="img" aria-label={ariaLabel}>
      {/* サマリー行 */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-sm tabular-nums">
          {t('entry.inspector.time.planned')} {formatDurationDisplay(plannedDuration)} /{' '}
          {t('entry.inspector.time.actual')} {formatDurationDisplay(actualDuration)}
        </span>
        <span className={cn('shrink-0 rounded-lg px-1 py-0 text-sm tabular-nums', badgeClass)}>
          {formatDiffBadge(totalDiffMin)}
        </span>
      </div>

      {/* 位置ベースバー */}
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className="flex h-full">
          {/* 左: 早く始めた分（点線ボーダー） */}
          {earlyStartMin > 0 && (
            <div
              className={cn(
                'h-full rounded-l-full border-2 border-r-0 border-dotted',
                colorClasses.border,
              )}
              style={{ width: `${pct(earlyStartMin)}%` }}
            />
          )}

          {/* 左: 遅れて始めた分（ハッチ） */}
          {lateStartMin > 0 && (
            <div
              className={cn('pattern-hatch h-full', earlyStartMin === 0 && 'rounded-l-full')}
              style={{
                width: `${pct(lateStartMin)}%`,
                backgroundColor: colorClasses.cssVarTint,
              }}
            />
          )}

          {/* 中央: 計画と実績が重なる実行区間 */}
          {overlapMin > 0 && (
            <div
              className={cn(
                'h-full',
                earlyStartMin === 0 && lateStartMin === 0 && 'rounded-l-full',
                lateEndMin === 0 && earlyEndMin === 0 && 'rounded-r-full',
              )}
              style={{
                width: `${pct(overlapMin)}%`,
                backgroundColor: colorClasses.cssVar,
              }}
            />
          )}

          {/* 右: 早く終わった分（ハッチ） */}
          {earlyEndMin > 0 && (
            <div
              className={cn('pattern-hatch h-full', lateEndMin === 0 && 'rounded-r-full')}
              style={{
                width: `${pct(earlyEndMin)}%`,
                backgroundColor: colorClasses.cssVarTint,
              }}
            />
          )}

          {/* 右: 遅く終わった分（点線ボーダー） */}
          {lateEndMin > 0 && (
            <div
              className={cn(
                'h-full rounded-r-full border-2 border-l-0 border-dotted',
                colorClasses.border,
              )}
              style={{ width: `${pct(lateEndMin)}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
