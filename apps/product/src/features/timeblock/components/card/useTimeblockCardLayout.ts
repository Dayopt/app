'use client';

/**
 * TimeblockCard のレイヤー幾何計算
 *
 * entry / position / props から、各レイヤー（planned / actual / content / gap / resize handle）
 * の位置・高さ・色・クラスをすべて算出する。JSX を持たない純粋な派生 state。
 */

import { useMemo } from 'react';

import { getTagColorClasses } from '@/features/tags';
import { cn } from '@dayopt/components';

import {
  computeActualTimeDiffOverlay,
  NO_OVERLAY,
  toMinutesOfDay,
} from '../../lib/actual-time-overlay';

import type { TimeblockCardPosition, TimeblockCardProps } from './TimeblockCard.types';

/** overlay 計算用の1時間高さ(px)。TimeblockCard は live grid 非接続のため固定値。live grid へ再接続する場合は responsive hourHeight（HOUR_HEIGHT_DENSITIES）の受け渡し再導入が必要 */
const DEFAULT_HOUR_HEIGHT = 72;

/** イベントの最小高さ(px) — 1 分粒度 entry でも視認できる程度に低く設定（PC のみ。mobile は touch target で底上げ） */
export const MIN_EVENT_HEIGHT = 14;

/**
 * モバイル時のイベント最小高さ(px)。
 * Why: 15分ブロック (HOUR_HEIGHT=72 時で 18px) が指幅より狭く、タップ／リサイズが困難。
 * 視認性とタップ精度を優先して 28px まで底上げする。
 * 15分連続ブロックが隙間なく並ぶと描画が 8px/個重なるが、実運用で稀なため許容。
 */
const MIN_EVENT_HEIGHT_MOBILE = 28;
export const MIN_VISIBLE_GAP_ACTION_HEIGHT = 24;

/** Z-index層 */
const Z_INDEX = {
  EVENTS: 10,
  DRAGGING: 30,
} as const;

type LayoutParams = Pick<
  TimeblockCardProps,
  | 'entry'
  | 'position'
  | 'isMobile'
  | 'className'
  | 'style'
  | 'isDragging'
  | 'isSelected'
  | 'isActive'
  | 'showActualDiff'
  | 'plannedHeight'
  | 'overlayPositionApplied'
  | 'tagColor'
  | 'onGapClick'
  | 'isGapAvailable'
  | 'gapCreationCutoffMs'
>;

export function useTimeblockCardLayout({
  entry,
  position,
  isMobile = false,
  className = '',
  style = {},
  isDragging = false,
  isSelected = false,
  isActive = false,
  showActualDiff = true,
  plannedHeight: plannedHeightProp,
  overlayPositionApplied = false,
  tagColor = null,
  onGapClick,
  isGapAvailable,
  gapCreationCutoffMs,
}: LayoutParams) {
  // タグカラー（props で解決済み）
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const accentColor = colorClasses?.cssVar ?? 'var(--entry-default)';

  // ドラフト（未保存プレビュー）かどうか判定
  const isDraft = entry.isDraft === true;
  // 進行中エントリかどうか（視覚区別に使用）
  const isActiveEntry = entry.timeblockState === 'active';
  // 過去エントリかどうか（subtle fade で「過ぎた」を視覚的に伝える。Apple Calendar 規範）
  const isPast = entry.timeblockState === 'past';
  // 予定外エントリかどうか（全体を破線枠で表示）
  const isUnplanned = entry.origin === 'unplanned';
  // スキップ済み（計画したがやらなかった）。計画レイヤーに muted で残し、実績の強調を消す
  const isSkippedEntry = entry.isSkipped === true;
  const plannedStart = entry.plannedStartDate ?? entry.startDate;
  const plannedEnd = entry.plannedEndDate ?? entry.endDate;
  const upcomingActualMatchesPlan =
    entry.timeblockState === 'upcoming' &&
    plannedStart != null &&
    plannedEnd != null &&
    entry.actualStartDate != null &&
    entry.actualEndDate != null &&
    plannedStart.getTime() === entry.actualStartDate.getTime() &&
    plannedEnd.getTime() === entry.actualEndDate.getTime();
  // actual が無い予定と、予定/記録が一致する upcoming は予定UIとして扱う。
  // upcoming でも実際に差分がある場合は、記録レイヤーと予定外部分を維持する。
  const renderAsPlanOnly =
    entry.origin === 'planned' &&
    (!showActualDiff ||
      (entry.actualStartDate == null && entry.actualEndDate == null) ||
      upcomingActualMatchesPlan);
  const contentEntry = renderAsPlanOnly
    ? { ...entry, actualStartDate: null, actualEndDate: null }
    : entry;
  // 予定 vs 記録の差分オーバーレイ
  const overlay = useMemo(
    () =>
      renderAsPlanOnly ? NO_OVERLAY : computeActualTimeDiffOverlay(entry, DEFAULT_HOUR_HEIGHT),
    [entry, renderAsPlanOnly],
  );
  const topGapStartMinutes =
    entry.startDate &&
    entry.actualStartDate &&
    entry.startDate.getTime() < entry.actualStartDate.getTime()
      ? toMinutesOfDay(entry.startDate)
      : null;
  const topGapEndMinutes =
    entry.startDate &&
    entry.actualStartDate &&
    entry.startDate.getTime() < entry.actualStartDate.getTime()
      ? toMinutesOfDay(entry.actualStartDate)
      : null;
  const bottomGapStartMinutes =
    entry.actualEndDate && entry.endDate && entry.actualEndDate.getTime() < entry.endDate.getTime()
      ? toMinutesOfDay(entry.actualEndDate)
      : null;
  const bottomGapEndMinutes =
    entry.actualEndDate && entry.endDate && entry.actualEndDate.getTime() < entry.endDate.getTime()
      ? toMinutesOfDay(entry.endDate)
      : null;
  const topGapAvailable =
    topGapStartMinutes != null && topGapEndMinutes != null
      ? (isGapAvailable?.(topGapStartMinutes, topGapEndMinutes) ?? true)
      : false;
  const bottomGapAvailable =
    bottomGapStartMinutes != null && bottomGapEndMinutes != null
      ? (isGapAvailable?.(bottomGapStartMinutes, bottomGapEndMinutes) ?? true)
      : false;
  const topGapClickEnabled =
    !!onGapClick &&
    topGapAvailable &&
    topGapEndMinutes != null &&
    entry.actualStartDate != null &&
    (gapCreationCutoffMs == null || entry.actualStartDate.getTime() <= gapCreationCutoffMs);
  const bottomGapClickEnabled =
    !!onGapClick &&
    bottomGapAvailable &&
    bottomGapEndMinutes != null &&
    entry.endDate != null &&
    (gapCreationCutoffMs == null || entry.endDate.getTime() <= gapCreationCutoffMs);
  const hasGapCreateLane = topGapClickEnabled || bottomGapClickEnabled;

  // positionが未定義の場合のデフォルト値
  const safePosition: TimeblockCardPosition = useMemo(
    () =>
      position || {
        top: 0,
        left: 0,
        width: 100,
        height: MIN_EVENT_HEIGHT,
      },
    [position],
  );

  // 左アクセントの幅（統一: 3px = --border-indicator トークン相当）
  const accentWidth = 3;

  const minHeight = isMobile ? MIN_EVENT_HEIGHT_MOBILE : MIN_EVENT_HEIGHT;
  const visualHeight = Math.max(safePosition.height, minHeight);
  const plannedHeight = Math.max(
    plannedHeightProp ??
      (overlayPositionApplied ? safePosition.height - overlay.heightDelta : safePosition.height),
    minHeight,
  );
  const plannedLayerTop = isUnplanned ? 0 : overlay.topShift;
  const actualLayerTop = isUnplanned ? 0 : overlay.topKind !== 'none' ? overlay.topHeight : 0;
  const actualLayerBottomGap =
    !isUnplanned && overlay.bottomKind !== 'none' ? overlay.bottomHeight : 0;
  const actualLayerHeight = Math.max(
    visualHeight - actualLayerTop - actualLayerBottomGap,
    minHeight,
  );
  const contentLayerTop =
    isUnplanned || (!renderAsPlanOnly && showActualDiff) ? actualLayerTop : plannedLayerTop;
  const contentLayerHeight =
    isUnplanned || (!renderAsPlanOnly && showActualDiff) ? actualLayerHeight : plannedHeight;
  const alignPlannedLayerToGrid = entry.origin === 'planned' && !renderAsPlanOnly;
  // planned bg は「context」として後ろに引かせ、actual body が「main」として前に出る intensity 階層
  const plannedBackgroundColor = `color-mix(in oklch, ${accentColor} 8%, var(--background))`;
  const actualBackgroundColor = `color-mix(in oklch, ${accentColor} 18%, var(--background))`;
  // skip（計画したがやらなかった）: 消さずに残し、タグ色の斜線ハッチングで「未実行の計画」を示す。
  // 視認性は通常の予定と同等に保ち（fade させない）、ハッチングだけが状態を伝える。
  const skippedBackgroundColor = `color-mix(in oklch, ${accentColor} 14%, var(--background))`;
  const skippedHatchImage = `repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in oklch, ${accentColor} 38%, transparent) 5px 7px)`;

  // 動的スタイルを計算
  const dynamicStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute' as const,
      top: `${safePosition.top}px`,
      left: renderAsPlanOnly ? `calc(${safePosition.left}% - 1px)` : `${safePosition.left}%`,
      width: `calc(${safePosition.width}% - ${renderAsPlanOnly ? 7 : 8}px)`,
      height: `${visualHeight}px`,
      zIndex: isSelected || isDragging ? Z_INDEX.DRAGGING : Z_INDEX.EVENTS,
      cursor: isDragging ? 'grabbing' : 'pointer',
      ...style,
    }),
    [safePosition, isSelected, isDragging, renderAsPlanOnly, style, visualHeight],
  );

  const unplannedBorderStyle: React.CSSProperties = {
    borderTopWidth: '2px',
    borderTopStyle: 'dashed',
    borderTopColor: accentColor,
    borderRightWidth: '2px',
    borderRightStyle: 'dashed',
    borderRightColor: accentColor,
    borderBottomWidth: '2px',
    borderBottomStyle: 'dashed',
    borderBottomColor: accentColor,
    borderRadius: '0 8px 8px 0',
  };

  const overtimeBorderStyle: React.CSSProperties = {
    borderTopWidth: '2px',
    borderTopStyle: 'dashed',
    borderTopColor: accentColor,
    borderRightWidth: '2px',
    borderRightStyle: 'dashed',
    borderRightColor: accentColor,
    borderBottomWidth: '2px',
    borderBottomStyle: 'dashed',
    borderBottomColor: accentColor,
    borderRadius: '0 8px 8px 0',
  };
  const topOvertimeBorderStyle: React.CSSProperties = {
    ...overtimeBorderStyle,
    borderRadius: '0 8px 0 0',
  };
  const bottomOvertimeBorderStyle: React.CSSProperties = {
    ...overtimeBorderStyle,
    borderRadius: '0 0 8px 0',
  };
  const actualBodyBorderRadius = `0 ${overlay.topKind === 'overtime' ? '0' : '8px'} ${
    overlay.bottomKind === 'overtime' ? '0' : '8px'
  } 0`;
  const resizeHandleHeight = isMobile
    ? 44
    : Math.min(32, Math.max(MIN_EVENT_HEIGHT, safePosition.height));
  const resizeHandleBottom = isMobile ? -40 : 0;
  const useCompactResizeHandle = !isMobile && safePosition.height <= 32;

  // CSSクラス（統一Timeblockデザイン: 左アクセント + 右角丸）
  // `group/entry` は子の resize handle icon が hover 時に visible になるための trigger
  const timeblockCardClasses = cn(
    'group/entry relative flex rounded-r-lg',
    'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    // Draft: state-selected オーバーレイ
    isDraft &&
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の rounded-[inherit] は親カードの角丸継承が必須
      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:transition-colors hover:before:bg-state-hover',
    isDraft &&
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の rounded-[inherit] は親カードの角丸継承が必須
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-state-selected',
    // 選択/アクティブ状態（ホバーが継続しているような見た目）
    !isDraft && (isSelected || isActive) && 'after:!bg-state-hover',
    // ホバーオーバーレイ
    !isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors hover:after:bg-state-hover',
    'text-foreground',
    isDragging && 'opacity-30',
    // past entry の subtle fade（draft / dragging には適用しない）
    !isDraft && !isDragging && isPast && 'opacity-90',
    isDraft ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-pointer',
    className,
  );

  return {
    accentColor,
    colorClasses,
    isDraft,
    isActiveEntry,
    isPast,
    isUnplanned,
    isSkippedEntry,
    renderAsPlanOnly,
    contentEntry,
    overlay,
    topGapStartMinutes,
    topGapEndMinutes,
    bottomGapStartMinutes,
    bottomGapEndMinutes,
    topGapClickEnabled,
    bottomGapClickEnabled,
    hasGapCreateLane,
    safePosition,
    accentWidth,
    visualHeight,
    plannedHeight,
    plannedLayerTop,
    actualLayerTop,
    actualLayerHeight,
    contentLayerTop,
    contentLayerHeight,
    alignPlannedLayerToGrid,
    plannedBackgroundColor,
    actualBackgroundColor,
    skippedBackgroundColor,
    skippedHatchImage,
    dynamicStyle,
    unplannedBorderStyle,
    topOvertimeBorderStyle,
    bottomOvertimeBorderStyle,
    actualBodyBorderRadius,
    resizeHandleHeight,
    resizeHandleBottom,
    useCompactResizeHandle,
    timeblockCardClasses,
  };
}
