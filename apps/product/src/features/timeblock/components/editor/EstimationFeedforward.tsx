'use client';

/**
 * 作成時フィードフォワード（ADR-026 の 1 点目）
 *
 * 「このタグの直近実績は 45m 前後です」を Plan の作成・編集時にだけ静かに出す。
 * 警告色・アイコン・感嘆符を使わない。ユーザーの入力を書き換えることは無く、
 * 読むかどうかはユーザーに委ねる（strategy §4-6 成績表化しない）。
 *
 * 出さない条件（どれか 1 つでも該当したら `null`）:
 * - 保存先が Record（過去の事実の記録に見積もりの話は要らない）
 * - タグ未選択
 * - draft の長さが 0 以下
 * - そのタグのサンプルが 3 件未満、または係数を取得できていない
 */

import { useTranslations } from 'next-intl';

import { formatDurationMinutes } from '@/lib/date';

import type { TimeblockDestination } from '../../domain/timeblock-destination';
import { useTagEstimationFactors } from '../../hooks/useTagEstimationFactors';

interface EstimationFeedforwardProps {
  /** 保存先。`'plan'` のときだけ表示する。 */
  destination: TimeblockDestination;
  tagId: string | null;
  /** draft の予定時間（分）。 */
  draftMinutes: number;
}

export function EstimationFeedforward({
  destination,
  tagId,
  draftMinutes,
}: EstimationFeedforwardProps) {
  const t = useTranslations('timeblock.editor.feedforward');
  const { project } = useTagEstimationFactors();

  if (destination !== 'plan') return null;

  const projection = project(tagId, draftMinutes);
  if (!projection) return null;

  return (
    <p className="text-muted-foreground text-xs" role="status">
      {t('recentActual', { duration: formatDurationMinutes(projection.minutes) })}
    </p>
  );
}
