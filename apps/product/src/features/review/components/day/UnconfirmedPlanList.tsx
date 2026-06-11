'use client';

import type { FulfillmentScore } from '@/features/entry';
import type { TagColorName } from '@/features/tags';
import { TagIcon } from '@/features/tags';

import { FulfillmentScoreButtons } from './FulfillmentScoreButtons';

/** 確認待ちリストの 1 行 */
export interface UnconfirmedPlanRow {
  id: string;
  title: string;
  /** 予定の時間帯ラベル（例: 9:00–10:00。TZ 変換は呼び出し側が担う） */
  timeLabel: string;
  color: TagColorName;
  icon: string | null;
}

/**
 * UnconfirmedPlanList — 確認待ちの予定リスト（Daily Close の確認儀式）
 *
 * 「計画どおりだったか」をまだ確認していない予定を列挙し、
 * 充実度の採点 = 確認としてその場で消化する。採点すると行が消える。
 * 0 件のときは親がパネルごと描画しない。
 */
export function UnconfirmedPlanList({
  rows,
  onScore,
}: {
  rows: UnconfirmedPlanRow[];
  onScore: (entryId: string, score: FulfillmentScore | null) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="divide-border divide-y">
      {rows.map((row) => (
        <div key={row.id} className="flex min-h-11 min-w-0 items-center gap-3 px-2 py-1">
          <TagIcon icon={row.icon} color={row.color} size="sm" />
          <div className="min-w-0 flex-1">
            <span className="text-foreground block truncate text-sm">{row.title}</span>
            <p className="text-muted-foreground font-mono text-xs tabular-nums">{row.timeLabel}</p>
          </div>
          <FulfillmentScoreButtons score={null} onChange={(score) => onScore(row.id, score)} />
        </div>
      ))}
    </div>
  );
}
