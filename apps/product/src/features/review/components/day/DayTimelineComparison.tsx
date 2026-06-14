'use client';

import { useTranslations } from 'next-intl';

import type { TagColorName } from '@/features/tags';
import { cn } from '@/lib/utils';

/** タイムライン上の 1 ブロック（時刻は日の開始からの分オフセット） */
export interface TimelineBlock {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  color: TagColorName;
}

interface DayTimelineComparisonProps {
  planned: TimelineBlock[];
  actual: TimelineBlock[];
  /** 分オフセット → 表示時刻（TZ 変換は呼び出し側が担う） */
  formatTime: (minutesFromDayStart: number) => string;
  className?: string;
}

/** 1 分あたりの描画高さ（px） */
const MINUTE_PX = 0.8;
/** 軸ラベルの間隔（分） */
const TICK_INTERVAL = 120;
/** ブロックの最小描画高さ（px） */
const MIN_BLOCK_PX = 18;

/**
 * DayTimelineComparison — 計画 vs 実績の 2 列ミニタイムライン
 *
 * 左に予定（start/end_time）、右に実績（actual_start/end_time）を同じ時間軸で並べ、
 * 開始の遅れ・延長・未実施のずれを視覚で示す。dayopt の 2-layer model を
 * 最も直接見せる日次ビューの主役（review-granularity-redesign 設計書 §5.1）。
 */
export function DayTimelineComparison({
  planned,
  actual,
  formatTime,
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
          <TimelineColumn blocks={actual} rangeStart={rangeStart} formatTime={formatTime} />
        </div>
      </div>
    </div>
  );
}

function TimelineColumn({
  blocks,
  rangeStart,
  formatTime,
}: {
  blocks: TimelineBlock[];
  rangeStart: number;
  formatTime: (minutesFromDayStart: number) => string;
}) {
  return (
    <div className="relative">
      {blocks.map((block) => {
        const top = (block.startMin - rangeStart) * MINUTE_PX;
        const blockHeight = Math.max((block.endMin - block.startMin) * MINUTE_PX, MIN_BLOCK_PX);

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
