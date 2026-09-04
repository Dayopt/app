'use client';

import { useTranslations } from 'next-intl';

import { getCategoryColorClasses } from '@/features/activities';

import type { ReportMirrorRow } from '../../../domain/report/report-view-model';

interface MirrorRowsProps {
  /** `|coef − 1|` の降順で最大 3 件。候補条件は domain 側が持つ。 */
  rows: readonly ReportMirrorRow[];
}

/**
 * 見積もりの鏡（仕様 §4.2）。
 *
 * 「癖の強い順」に最大 3 件、一文ずつ。**全体遵守率のような合成値は出さない**し、
 * 良し悪しの色も付けない（仕様 §12）。候補が無い期間は責めずに黙る。
 */
export function MirrorRows({ rows }: MirrorRowsProps) {
  const t = useTranslations('report.execution.mirror');

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{t('heading')}</p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('empty')}</p>
      ) : (
        <ul data-report-rows="mirror" className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.activityId ?? '__unassigned'} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: mirrorColor(row.color) }}
              />
              <span className="text-foreground min-w-0 flex-1">
                {t(`sentence.${row.tone}`, {
                  name: row.name ?? t('unnamed'),
                  coefficient: row.coefficient.toFixed(2),
                  percent: Math.round(row.coefficient * 100),
                })}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                ×{row.coefficient.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function mirrorColor(color: string | null): string {
  if (color === null) return 'var(--muted-foreground)';
  return getCategoryColorClasses(color).cssVar;
}
