'use client';

import { useTranslations } from 'next-intl';

import { getCategoryColorClasses } from '@/features/activities';
import { cn } from '@dayopt/components';

import { formatReportDuration } from '../../../domain/report/format-duration';
import { MirrorRows } from './MirrorRows';

import type { ReportExecutionRow, ReportMirrorRow } from '../../../domain/report/report-view-model';
import type { ReportGranularity } from '../../../lib/report-period';
import type { ReportDetailTarget } from '../../../stores/useReportDetailStore';

interface ExecutionChapterProps {
  granularity: ReportGranularity;
  /** 記録か予定のどちらかがある行。**足切りしない**（決算の完全性、仕様 §13-10）。 */
  rows: readonly ReportExecutionRow[];
  mirrorRows: readonly ReportMirrorRow[];
  /** 行をクリックした時に詳細パネルへ渡す。接続は #2581。 */
  onSelectActivity?: ((target: ReportDetailTarget) => void) | undefined;
}

/** 記録バーの高さ（px）と角丸（px）。仕様 §4.2。 */
const RECORDED_BAR_HEIGHT = 5;
const RECORDED_BAR_RADIUS = 3;

/**
 * 2 章「執行 — 計画どおりだったか」。
 *
 * 行は記録の降順で**すべて**出す。件数で切ると決算にならない（仕様 §13-10）ので、
 * 多くてもカード内スクロールにせず素直に伸ばす。
 *
 * **全体遵守率・達成率のような合成値は作らない**（仕様 §12）。比率は行ごとの
 * 「予定比」だけで、過去予定が閾値未満の行では沈黙する（仕様 §0-4）。
 */
export function ExecutionChapter({
  granularity,
  rows,
  mirrorRows,
  onSelectActivity,
}: ExecutionChapterProps) {
  const t = useTranslations('report.execution');

  return (
    <section
      aria-label={t('kick')}
      data-report-chapter="execution"
      className="border-border-subtle bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground text-xs">{t('kick')}</p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t(`empty.${granularity}`)}</p>
      ) : (
        <ul data-report-rows="execution" className="flex flex-col">
          {rows.map((row) => (
            <ExecutionRow
              key={row.activityId ?? '__unassigned'}
              onSelectActivity={onSelectActivity}
              row={row}
            />
          ))}
        </ul>
      )}

      <MirrorRows onSelectActivity={onSelectActivity} rows={mirrorRows} />
    </section>
  );
}

function ExecutionRow({
  onSelectActivity,
  row,
}: {
  onSelectActivity?: ((target: ReportDetailTarget) => void) | undefined;
  row: ReportExecutionRow;
}) {
  const t = useTranslations('report.execution');
  const name = row.name ?? t('unnamed');
  const recorded = formatReportDuration(row.recordedMinutes);

  return (
    <li>
      <button
        type="button"
        // 詳細パネル（#2581）へ渡す口。この issue では呼ばれても何も起きない
        onClick={() =>
          onSelectActivity?.({
            activityId: row.activityId,
            name: row.name,
            categoryName: row.categoryName,
            color: row.color,
          })
        }
        aria-label={t('rowAriaLabel', { name, recorded })}
        className="hover:bg-state-hover flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: rowColor(row.color) }}
        />

        <span className={cn('w-24 shrink-0 truncate text-xs', row.archived && 'opacity-50')}>
          {name}
        </span>

        <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-1">
          {/* 上段 = 記録。幅は行の最大値（記録・予定のどちらか大きい方）に対する比 */}
          <span
            className="block"
            style={{
              backgroundColor: rowColor(row.color),
              borderRadius: RECORDED_BAR_RADIUS,
              height: RECORDED_BAR_HEIGHT,
              width: `${row.recordedRatio * 100}%`,
            }}
          />
          {/* 下段 = 予定。塗らずに破線だけで示す（予定は事実ではない） */}
          {row.plannedRatio !== null && (
            <span
              className="border-border block border-t-2 border-dashed"
              style={{ width: `${row.plannedRatio * 100}%` }}
            />
          )}
        </span>

        <span className="text-foreground w-10 shrink-0 text-right text-xs tabular-nums">
          {recorded}
        </span>

        {/* 過去予定が閾値未満の行では比率を作らない。0% や空文字ではなくダッシュ */}
        <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
          {row.planRatioPercent === null
            ? t('planRatioUnavailable')
            : t('planRatio', { percent: row.planRatioPercent })}
        </span>
      </button>
    </li>
  );
}

/** カテゴリ色を CSS 変数へ写す。未分類（色なし）は `--muted-foreground`。 */
function rowColor(color: string | null): string {
  if (color === null) return 'var(--muted-foreground)';
  return getCategoryColorClasses(color).cssVar;
}
