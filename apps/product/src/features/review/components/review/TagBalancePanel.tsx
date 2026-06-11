'use client';

import type { TagColorName } from '@/features/tags';
import { TagIcon } from '@/features/tags';

import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';
import { TagBreakdownBar } from './TagBreakdownBar';

/** タグバランスの 1 行 */
export interface TagBalanceRow {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon: string | null;
  minutes: number;
  percentage: number;
}

/**
 * TagBalancePanel — タグ別時間配分（積み上げバー + リスト）
 *
 * 週次 / 月次 / 年次ビューで共用するタグバランス表示。
 * 行クリックでタグ詳細ページへの遷移を呼び出し側に委ねる。
 */
export function TagBalancePanel({
  rows,
  onTagClick,
}: {
  rows: TagBalanceRow[];
  onTagClick: (tagId: string) => void;
}) {
  const segments = rows.map((tag) => ({
    tagId: tag.tagId,
    tagName: tag.tagName,
    tagColor: tag.tagColor,
    tagIcon: tag.tagIcon,
    minutes: tag.minutes,
  }));

  return (
    <>
      <TagBreakdownBar segments={segments} onTagClick={onTagClick} />
      <div className="divide-border mt-3 divide-y">
        {rows.map((tag) => (
          <button
            key={tag.tagId}
            type="button"
            className="hover:bg-state-hover flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
            onClick={() => onTagClick(tag.tagId)}
          >
            <TagIcon icon={tag.tagIcon ?? null} color={tag.tagColor} size="sm" />
            <span className="text-foreground min-w-0 flex-1 truncate text-sm">{tag.tagName}</span>
            <span className="text-foreground font-mono text-sm tabular-nums">
              {formatMinutesDuration(tag.minutes)}
            </span>
            <span className="text-muted-foreground w-10 text-right font-mono text-sm tabular-nums">
              {tag.percentage}%
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
