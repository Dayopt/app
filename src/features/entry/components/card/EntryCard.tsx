/**
 * エントリー表示カードコンポーネント
 * タグカラーを反映した左ボーダーアクセント + 右角丸の統一デザイン
 *
 * Pure props コンポーネント: store / data-fetch hook なし。
 * タグ情報・アンカー位置・モバイル判定は呼び出し元から props で渡す。
 */

'use client';

import React, { memo, startTransition, useCallback, useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import {
  computeActualTimeDiffOverlay,
  formatDiffMinutes,
  toMinutesOfDay,
} from '../../lib/actual-time-overlay';

import type { EntryCardProps } from './EntryCard.types';
import { EntryCardContent } from './EntryCardContent';

/** SSRフォールバック用デフォルトの1時間高さ(px) */
const DEFAULT_HOUR_HEIGHT = 72;

/** イベントの最小高さ(px) — 1 分粒度 entry でも視認できる程度に低く設定（PC のみ。mobile は touch target で底上げ） */
const MIN_EVENT_HEIGHT = 14;

/**
 * モバイル時のイベント最小高さ(px)。
 * Why: 15分ブロック (HOUR_HEIGHT=72 時で 18px) が指幅より狭く、タップ／リサイズが困難。
 * 視認性とタップ精度を優先して 28px まで底上げする。
 * 15分連続ブロックが隙間なく並ぶと描画が 8px/個重なるが、実運用で稀なため許容。
 */
const MIN_EVENT_HEIGHT_MOBILE = 28;

/** Z-index層 */
const Z_INDEX = {
  EVENTS: 10,
  DRAGGING: 30,
} as const;

/** カレンダーグリッド上に表示するエントリカードコンポーネント（ドラッグ・リサイズ・Inspector連携対応） */
export const EntryCard = memo<EntryCardProps>(function EntryCard({
  entry,
  tagName = null,
  tagColor = null,
  position,
  onClick,
  onContextMenu,
  onDragStart,
  onTouchStart,
  onDragEnd,
  onResizeStart,
  onAnchorRect,
  isDragging = false,
  isSelected = false,
  isActive = false,
  isMobile = false,
  className = '',
  style = {},
  previewTime = null,
  hourHeight: hourHeightProp,
  overlayPositionApplied = false,
  onGapClick,
  gapCreationCutoffMs,
}) {
  const t = useTranslations();

  // タグカラー（props で解決済み）
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const accentColor = colorClasses?.cssVar ?? 'var(--entry-default)';

  // ドラフト（未保存プレビュー）かどうか判定
  const isDraft = entry.isDraft === true;
  // 過去エントリかどうか（リサイズ・ドラッグ無効化に使用）
  const isPast = entry.entryState === 'past';
  // 進行中エントリかどうか（視覚区別に使用）
  const isActiveEntry = entry.entryState === 'active';
  // 予定外エントリかどうか（全体を破線枠で表示）
  const isUnplanned = entry.origin === 'unplanned';
  // 予定 vs 記録の差分オーバーレイ
  const overlay = useMemo(
    () => computeActualTimeDiffOverlay(entry, hourHeightProp ?? DEFAULT_HOUR_HEIGHT),
    [entry, hourHeightProp],
  );
  const topGapClickEnabled =
    !!onGapClick &&
    !!entry.startDate &&
    !!entry.actualStartDate &&
    entry.startDate.getTime() < entry.actualStartDate.getTime() &&
    (gapCreationCutoffMs == null || entry.actualStartDate.getTime() <= gapCreationCutoffMs);
  const bottomGapClickEnabled =
    !!onGapClick &&
    !!entry.actualEndDate &&
    !!entry.endDate &&
    entry.actualEndDate.getTime() < entry.endDate.getTime() &&
    (gapCreationCutoffMs == null || entry.endDate.getTime() <= gapCreationCutoffMs);

  // positionが未定義の場合のデフォルト値
  const safePosition = useMemo(
    () =>
      position || {
        top: 0,
        left: 0,
        width: 100,
        height: MIN_EVENT_HEIGHT,
      },
    [position],
  );

  // hourHeightProp がある && 外部未調整 = DayColumn（グリッド相対配置）→ 位置調整を適用
  // hourHeightProp がない or 外部調整済み = WeekContent等 → EntryCard内での位置調整は不要
  const applyPositionAdjust = hourHeightProp !== undefined && !overlayPositionApplied;

  // 左アクセントの幅（統一: 3px = --border-indicator トークン相当）
  const accentWidth = 3;

  // 計画外カードの内側オフセット（親の実線ボーダーと重ならないよう内側に配置）
  const unplannedInset = isUnplanned ? accentWidth + 2 : 0;

  const minHeight = isMobile ? MIN_EVENT_HEIGHT_MOBILE : MIN_EVENT_HEIGHT;

  // 動的スタイルを計算（overlay.topShift/heightDelta でカード位置を調整）
  const dynamicStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute' as const,
      top: `${safePosition.top - (applyPositionAdjust ? overlay.topShift : 0)}px`,
      left: isUnplanned
        ? `calc(${safePosition.left}% + ${unplannedInset}px)`
        : `${safePosition.left}%`,
      width: isUnplanned
        ? `calc(${safePosition.width}% - 8px - ${unplannedInset}px)`
        : `calc(${safePosition.width}% - 8px)`,
      height: `${Math.max(safePosition.height + (applyPositionAdjust ? overlay.heightDelta : 0), minHeight)}px`,
      zIndex: isSelected || isDragging ? Z_INDEX.DRAGGING : Z_INDEX.EVENTS,
      cursor: isDragging ? 'grabbing' : 'pointer',
      ...style,
    }),
    [
      safePosition,
      overlay,
      applyPositionAdjust,
      isSelected,
      isDragging,
      style,
      isUnplanned,
      unplannedInset,
      minHeight,
    ],
  );

  // 超過オーバーレイの外枠（タグ色の破線で一周 + 角丸）
  const overtimeBorderStyle: React.CSSProperties = {
    border: `2px dashed ${accentColor}`,
    borderRadius: '8px',
  };

  // イベントハンドラー
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Rect計測は同期で即座に実行（レイアウト情報が必要）
      if (onAnchorRect) {
        const rect = e.currentTarget.getBoundingClientRect();
        onAnchorRect({
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
      // Inspector マウントは重いため startTransition で INP 改善
      startTransition(() => {
        onClick?.(entry);
      });
    },
    [onClick, entry, onAnchorRect],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(entry, e);
    },
    [onContextMenu, entry],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDraft) return;
      if (e.button === 0) {
        onDragStart?.(entry, e, {
          top: safePosition.top,
          left: safePosition.left,
          width: safePosition.width,
          height: safePosition.height,
        });
      }
    },
    [isDraft, onDragStart, entry, safePosition],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isDraft) return;
      onTouchStart?.(entry, e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [isDraft, onTouchStart, entry, safePosition],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onDragEnd?.(entry);
    }
  }, [isDragging, onDragEnd, entry]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(entry);
      }
    },
    [onClick, entry],
  );

  const handleBottomResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart?.(entry, 'bottom', e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [onResizeStart, entry, safePosition],
  );

  const handleBottomResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      onResizeStart?.(entry, 'bottom', e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [onResizeStart, entry, safePosition],
  );

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
    }
  }, []);

  // Escキーでドラッグをキャンセル
  useEffect(() => {
    if (!isDragging) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDragEnd?.(entry);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDragging, onDragEnd, entry]);

  // CSSクラス（統一Entryデザイン: 左アクセント + 右角丸）
  // `group/entry` は子の resize handle icon が hover 時に visible になるための trigger
  const entryCardClasses = cn(
    'group/entry relative flex rounded-r-lg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    // Draft: state-selected オーバーレイ
    isDraft &&
      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:transition-colors hover:before:bg-state-hover',
    isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-state-selected',
    // 選択/アクティブ状態（ホバーが継続しているような見た目）
    !isDraft && (isSelected || isActive) && 'after:!bg-state-hover',
    // ホバーオーバーレイ
    !isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors hover:after:bg-state-hover',
    'text-foreground',
    isDragging && 'opacity-30',
    isDraft ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-pointer',
    className,
  );

  if (!entry || !entry.id) {
    return null;
  }

  return (
    <div
      data-entry-card
      data-entry-id={entry.id}
      data-entry-origin={entry.origin}
      className={entryCardClasses}
      style={dynamicStyle}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      draggable={false}
      tabIndex={0}
      aria-label={isDraft ? `draft: ${tagName ?? entry.title}` : `entry: ${tagName ?? entry.title}`}
    >
      {/* 花びらパーティクル（新規作成アニメーション時のみ表示） */}
      {className?.includes('animate-entry-pop') && (
        <div
          className="entry-petals"
          aria-hidden
          style={{ '--petal-color': accentColor } as React.CSSProperties}
        >
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
        </div>
      )}

      {/* 超過オーバーレイ: 上部 — カード外に破線枠、中は透明 */}
      {overlay.topKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 flex flex-col items-center justify-center"
          style={{ top: 0, height: `${overlay.topHeight}px`, ...overtimeBorderStyle }}
        >
          {overlay.topHeight >= 16 && (
            <span className="text-muted-foreground text-xs">
              <span className="mr-1 opacity-60">{t('calendar.event.diff.overtime')}</span>
              <span className="tabular-nums">{formatDiffMinutes(overlay.topDiffMin)}</span>
            </span>
          )}
        </div>
      )}

      {/* 超過オーバーレイ: 下部 — カード外に破線枠、中は透明 */}
      {overlay.bottomKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 flex flex-col items-center justify-center"
          style={{ bottom: 0, height: `${overlay.bottomHeight}px`, ...overtimeBorderStyle }}
        >
          {overlay.bottomHeight >= 16 && (
            <span className="text-muted-foreground text-xs">
              <span className="mr-1 opacity-60">{t('calendar.event.diff.overtime')}</span>
              <span className="tabular-nums">{formatDiffMinutes(overlay.bottomDiffMin)}</span>
            </span>
          )}
        </div>
      )}

      {/* カード実体（アクセント + 本体）— 予定範囲のみに制限 */}
      <div
        className={cn('absolute right-0 left-0 flex', isUnplanned && 'rounded-lg')}
        style={{
          top: overlay.topKind === 'overtime' ? `${overlay.topHeight}px` : 0,
          bottom: overlay.bottomKind === 'overtime' ? `${overlay.bottomHeight}px` : 0,
          ...(isUnplanned ? overtimeBorderStyle : {}),
        }}
      >
        {/* 左アクセントストリップ（予定外は非表示） */}
        {!isUnplanned && (
          <div
            className={cn(
              'relative shrink-0',
              isActiveEntry && 'animate-pulse',
              colorClasses ? colorClasses.dot : 'bg-entry-default',
            )}
            style={{ width: `${accentWidth}px` }}
          />
        )}

        {/* カード本体 */}
        <div
          className={cn(
            'relative min-w-0 flex-1 overflow-hidden',
            isUnplanned ? 'rounded-lg' : 'rounded-r-lg',
            safePosition.height < 40
              ? isMobile
                ? 'flex items-center px-2 text-xs'
                : 'flex items-center px-2 text-xs'
              : isMobile
                ? 'flex items-start gap-1 px-2 pt-2 text-sm'
                : 'p-2 text-sm',
            isUnplanned ? 'bg-background' : colorClasses ? colorClasses.tint : 'bg-muted',
          )}
        >
          <EntryCardContent
            plan={entry}
            tagName={tagName}
            isCompact={safePosition.height < 40}
            showTime={safePosition.height >= 30}
            previewTime={previewTime}
          />

          {/* 予定 vs 記録: 上部 — 未実行はハッチング + 空き枠「+」ボタン */}
          {overlay.topKind === 'unexecuted' && (
            <div
              data-entry-gap="top"
              aria-hidden={!topGapClickEnabled ? true : undefined}
              role={topGapClickEnabled ? 'button' : undefined}
              aria-label={topGapClickEnabled ? t('calendar.event.diff.addRecordToGap') : undefined}
              className={cn(
                'pattern-hatch absolute top-0 right-0 left-0 flex flex-col items-center justify-center',
                topGapClickEnabled ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
              )}
              style={{ height: `${overlay.topHeight}px` }}
              onMouseDown={topGapClickEnabled ? (e) => e.stopPropagation() : undefined}
              onTouchStart={topGapClickEnabled ? (e) => e.stopPropagation() : undefined}
              onClick={
                topGapClickEnabled
                  ? (e) => {
                      e.stopPropagation();
                      onGapClick?.(
                        toMinutesOfDay(entry.startDate!),
                        toMinutesOfDay(entry.actualStartDate!),
                      );
                    }
                  : undefined
              }
            >
              {overlay.topHeight >= 16 && !topGapClickEnabled && (
                <span className="text-muted-foreground text-xs">
                  <span className="mr-1 opacity-60">{t('calendar.event.diff.short')}</span>
                  <span className="tabular-nums">{formatDiffMinutes(overlay.topDiffMin)}</span>
                </span>
              )}
              {overlay.topHeight >= 32 && topGapClickEnabled && (
                <span className="bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground flex size-6 items-center justify-center rounded-full text-sm transition-colors">
                  +
                </span>
              )}
            </div>
          )}

          {/* 予定 vs 記録: 下部 — 未実行はハッチング + 空き枠「+」ボタン */}
          {overlay.bottomKind === 'unexecuted' && (
            <div
              data-entry-gap="bottom"
              aria-hidden={!bottomGapClickEnabled ? true : undefined}
              role={bottomGapClickEnabled ? 'button' : undefined}
              aria-label={
                bottomGapClickEnabled ? t('calendar.event.diff.addRecordToGap') : undefined
              }
              className={cn(
                'pattern-hatch absolute right-0 bottom-0 left-0 flex flex-col items-center justify-center',
                bottomGapClickEnabled
                  ? 'pointer-events-auto cursor-pointer'
                  : 'pointer-events-none',
              )}
              style={{ height: `${overlay.bottomHeight}px` }}
              onMouseDown={bottomGapClickEnabled ? (e) => e.stopPropagation() : undefined}
              onTouchStart={bottomGapClickEnabled ? (e) => e.stopPropagation() : undefined}
              onClick={
                bottomGapClickEnabled
                  ? (e) => {
                      e.stopPropagation();
                      onGapClick?.(
                        toMinutesOfDay(entry.actualEndDate!),
                        toMinutesOfDay(entry.endDate!),
                      );
                    }
                  : undefined
              }
            >
              {overlay.bottomHeight >= 16 && !bottomGapClickEnabled && (
                <span className="text-muted-foreground text-xs">
                  <span className="mr-1 opacity-60">{t('calendar.event.diff.short')}</span>
                  <span className="tabular-nums">{formatDiffMinutes(overlay.bottomDiffMin)}</span>
                </span>
              )}
              {overlay.bottomHeight >= 32 && bottomGapClickEnabled && (
                <span className="bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground flex size-6 items-center justify-center rounded-full text-sm transition-colors">
                  +
                </span>
              )}
            </div>
          )}
        </div>
        {/* /カード本体 */}

        {/* 下端リサイズハンドル（Draft/Past は非表示）
           PC: 常時 render、hover で pill 出現。
           Mobile: Inspector 開いている entry（isActive）のみ render し、pill は常時表示。
           短いカード（< 40px）は height=44px・bottom=-40px でブロック外側に張り出す。
           card 本体の overflow-hidden 外に置くことで pill icon が短い card でも visible。 */}
        {!isDraft && !isPast && (!isMobile || isActive) && (
          <>
            {/* drawer pill 風 affordance — PC は hover で出現、Mobile は isActive のとき常時 visible。
                pointer-events-none で click は下にある handle が拾う。 */}
            <span
              aria-hidden
              className={cn(
                'bg-muted-foreground pointer-events-none absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full transition-opacity duration-150',
                isMobile && isActive ? 'opacity-100' : 'opacity-0 group-hover/entry:opacity-100',
              )}
              style={{ zIndex: 11 }}
            />
            <div
              className="focus:ring-ring absolute right-0 left-0 cursor-ns-resize focus:ring-2 focus:ring-offset-1 focus:outline-none"
              role="slider"
              tabIndex={0}
              aria-label="Resize entry duration"
              aria-orientation="vertical"
              aria-valuenow={safePosition.height}
              aria-valuemin={MIN_EVENT_HEIGHT}
              aria-valuemax={480}
              onMouseDown={handleBottomResizeMouseDown}
              onTouchStart={handleBottomResizeTouchStart}
              onKeyDown={handleResizeKeyDown}
              style={{
                // Mobile は touch target 規約 (min-h-11) に合わせて常に 44px。
                // PC は短い card のときのみ 44px、通常 32px。
                height: isMobile || safePosition.height < 40 ? '44px' : '32px',
                bottom: isMobile || safePosition.height < 40 ? '-40px' : '-12px',
                zIndex: 10,
              }}
              title={t('calendar.event.adjustEndTime')}
            />
          </>
        )}
      </div>
      {/* /カード実体ラッパー */}
    </div>
  );
});
