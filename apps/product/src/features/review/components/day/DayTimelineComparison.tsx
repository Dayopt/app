'use client';

import { Frown, Meh, Smile } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { FulfillmentScore } from '@/features/entry';
import type { TagColorName } from '@/features/tags';
import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
import { cn } from '@/lib/utils';

/** タイムライン上の 1 ブロック（時刻は日の開始からの分オフセット） */
export interface TimelineBlock {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  color: TagColorName;
  /** 充実度スコア（実績ブロックの採点状態。undefined = 採点対象外） */
  fulfillmentScore?: FulfillmentScore | null | undefined;
}

interface DayTimelineComparisonProps {
  planned: TimelineBlock[];
  actual: TimelineBlock[];
  /** 分オフセット → 表示時刻（TZ 変換は呼び出し側が担う） */
  formatTime: (minutesFromDayStart: number) => string;
  /**
   * 実績ブロックの充実度採点ハンドラ。
   * 渡すと実績列のブロックがタップ採点可能になる（Daily Close の核）。
   */
  onScoreChange?: ((entryId: string, score: FulfillmentScore | null) => void) | undefined;
  className?: string;
}

/** 1 分あたりの描画高さ（px） */
const MINUTE_PX = 0.8;
/** 軸ラベルの間隔（分） */
const TICK_INTERVAL = 120;
/** ブロックの最小描画高さ（px） */
const MIN_BLOCK_PX = 18;

const SCORE_OPTIONS: {
  score: FulfillmentScore;
  icon: typeof Smile;
  labelKey: 'fulfillmentTooltipLow' | 'fulfillmentTooltipMedium' | 'fulfillmentTooltipHigh';
}[] = [
  { score: 1, icon: Frown, labelKey: 'fulfillmentTooltipLow' },
  { score: 2, icon: Meh, labelKey: 'fulfillmentTooltipMedium' },
  { score: 3, icon: Smile, labelKey: 'fulfillmentTooltipHigh' },
];

const SCORE_ICONS: Record<FulfillmentScore, typeof Smile> = {
  1: Frown,
  2: Meh,
  3: Smile,
};

/**
 * DayTimelineComparison — 計画 vs 実績の 2 列ミニタイムライン
 *
 * 左に予定（start/end_time）、右に実績（actual_start/end_time）を同じ時間軸で並べ、
 * 開始の遅れ・延長・未実施のずれを視覚で示す。dayopt の 2-layer model を
 * 最も直接見せる日次ビューの主役（review-granularity-redesign 設計書 §5.1）。
 * onScoreChange を渡すと実績ブロックをその場で充実度採点できる。
 */
export function DayTimelineComparison({
  planned,
  actual,
  formatTime,
  onScoreChange,
  className,
}: DayTimelineComparisonProps) {
  const t = useTranslations('calendar.stats');

  const all = [...planned, ...actual];
  if (all.length === 0) return null;

  // 表示範囲: 最初のブロックの 30 分前 〜 最後のブロックの 30 分後（時間単位に丸め、0-24時に clamp）
  const minStart = Math.min(...all.map((b) => b.startMin));
  const maxEnd = Math.max(...all.map((b) => b.endMin));
  const rangeStart = Math.max(0, Math.floor((minStart - 30) / 60) * 60);
  const rangeEnd = Math.min(24 * 60, Math.ceil((maxEnd + 30) / 60) * 60);
  const rangeMinutes = Math.max(60, rangeEnd - rangeStart);
  const height = rangeMinutes * MINUTE_PX;

  const ticks: number[] = [];
  for (let min = rangeStart; min <= rangeEnd; min += TICK_INTERVAL) {
    ticks.push(min);
  }

  return (
    <div className={className}>
      <div className="mb-2 grid grid-cols-2 gap-2 pl-12">
        <p className="text-muted-foreground text-center text-xs">{t('overview.planned')}</p>
        <p className="text-muted-foreground text-center text-xs">{t('overview.actual')}</p>
      </div>

      <div className="relative" style={{ height }}>
        {/* 時刻軸 + グリッド線 */}
        {ticks.map((min) => (
          <div
            key={min}
            className="absolute right-0 left-0 flex items-center gap-2"
            style={{ top: (min - rangeStart) * MINUTE_PX }}
          >
            <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">
              {formatTime(min)}
            </span>
            <div className="border-border-subtle flex-1 border-t" />
          </div>
        ))}

        {/* 2 列のブロック */}
        <div className="absolute inset-y-0 right-0 left-12 grid grid-cols-2 gap-2">
          <TimelineColumn blocks={planned} rangeStart={rangeStart} formatTime={formatTime} />
          <TimelineColumn
            blocks={actual}
            rangeStart={rangeStart}
            formatTime={formatTime}
            onScoreChange={onScoreChange}
          />
        </div>
      </div>
    </div>
  );
}

function TimelineColumn({
  blocks,
  rangeStart,
  formatTime,
  onScoreChange,
}: {
  blocks: TimelineBlock[];
  rangeStart: number;
  formatTime: (minutesFromDayStart: number) => string;
  onScoreChange?: ((entryId: string, score: FulfillmentScore | null) => void) | undefined;
}) {
  return (
    <div className="relative">
      {blocks.map((block) => {
        const top = (block.startMin - rangeStart) * MINUTE_PX;
        const blockHeight = Math.max((block.endMin - block.startMin) * MINUTE_PX, MIN_BLOCK_PX);

        if (onScoreChange) {
          return (
            <ScorableBlock
              key={block.id}
              block={block}
              top={top}
              height={blockHeight}
              formatTime={formatTime}
              onScoreChange={onScoreChange}
            />
          );
        }

        return (
          <div
            key={block.id}
            className={blockClassName(blockHeight)}
            style={blockStyle(block, top, blockHeight)}
            title={blockTitle(block, formatTime)}
          >
            <BlockContent block={block} height={blockHeight} formatTime={formatTime} />
          </div>
        );
      })}
    </div>
  );
}

/** タップで充実度を採点できる実績ブロック */
function ScorableBlock({
  block,
  top,
  height,
  formatTime,
  onScoreChange,
}: {
  block: TimelineBlock;
  top: number;
  height: number;
  formatTime: (minutesFromDayStart: number) => string;
  onScoreChange: (entryId: string, score: FulfillmentScore | null) => void;
}) {
  const t = useTranslations('calendar.stats');
  const tFulfillment = useTranslations('entry.inspector.time');
  const currentScore = block.fulfillmentScore ?? null;
  const ScoreIcon = currentScore != null ? SCORE_ICONS[currentScore] : Smile;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            blockClassName(height),
            'hover:bg-state-hover focus-visible:ring-ring w-full cursor-pointer text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
          )}
          style={blockStyle(block, top, height)}
          title={blockTitle(block, formatTime)}
          aria-label={`${block.title} — ${t('daily.scoreFulfillment')}`}
        >
          <div className="flex min-w-0 items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <BlockContent block={block} height={height} formatTime={formatTime} />
            </div>
            <ScoreIcon
              className={cn(
                'size-3.5 shrink-0',
                currentScore != null ? 'text-foreground' : 'text-muted-foreground',
              )}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-auto p-2">
        <p className="text-muted-foreground mb-1 px-1 text-xs">{t('daily.scoreFulfillment')}</p>
        <div className="flex items-center gap-1">
          {SCORE_OPTIONS.map(({ score, icon: Icon, labelKey }) => {
            const isSelected = currentScore === score;
            return (
              <button
                key={score}
                type="button"
                aria-label={tFulfillment(labelKey)}
                aria-pressed={isSelected}
                onClick={() => onScoreChange(block.id, isSelected ? null : score)}
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  isSelected
                    ? 'bg-state-selected text-foreground'
                    : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BlockContent({
  block,
  height,
  formatTime,
}: {
  block: TimelineBlock;
  height: number;
  formatTime: (minutesFromDayStart: number) => string;
}) {
  const isCompact = height < 32;
  return (
    <>
      <p className="text-foreground truncate text-xs leading-tight">{block.title}</p>
      {!isCompact && (
        <p className="text-muted-foreground truncate font-mono text-xs tabular-nums">
          {formatTime(block.startMin)}–{formatTime(block.endMin)}
        </p>
      )}
    </>
  );
}

function blockClassName(height: number): string {
  return cn(
    'bg-secondary absolute right-0 left-0 overflow-hidden rounded-lg border-l-[3px] px-2',
    height < 32 ? 'py-0' : 'py-1',
  );
}

function blockStyle(block: TimelineBlock, top: number, height: number) {
  return {
    top,
    height,
    borderLeftColor: `var(--tag-${block.color})`,
  };
}

function blockTitle(
  block: TimelineBlock,
  formatTime: (minutesFromDayStart: number) => string,
): string {
  return `${block.title} ${formatTime(block.startMin)}–${formatTime(block.endMin)}`;
}
