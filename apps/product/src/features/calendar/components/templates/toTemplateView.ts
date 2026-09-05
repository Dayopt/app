/**
 * `planTemplates.list` の出力を Sidebar の表示モデル（`TemplateView`）へ写す（#2567）。
 *
 * - **ラベルは block の `title`**（保存時点の Plan タイトルのスナップショット）。適用すると
 *   この文字列がそのまま Plan の title になるので、プレビューの見出しと一致する
 * - **色とアイコンは activity から継承**する。解決には `useActivitiesMap` を使う
 *   （`useActivityTree` はアーカイブ済みを含まないため、アーカイブした activity を参照する
 *   ブロックの見た目が消える）
 * - 比率は描画専用の派生値。保存値は分（`anchorMinute`）で、長さは server が毎回計算する
 */

import { resolveCategoryColor } from '@/features/activities';

import type { TemplateView } from './types';

/** 錨位置・長さを 0〜1 の比率へ落とすための一日の分数。 */
const MINUTES_PER_DAY = 1440;

interface PlanTemplateBlockListItem {
  id: string;
  activityId: string | null;
  title: string;
  anchorMinute: number;
  previewDurationMinutes: number;
}

interface PlanTemplateListItem {
  id: string;
  name: string;
  blocks: ReadonlyArray<PlanTemplateBlockListItem>;
}

interface ActivityAppearance {
  color: string | null;
  icon: string | null;
}

export function toTemplateView(
  template: PlanTemplateListItem,
  getActivityById: (activityId: string) => ActivityAppearance | undefined,
): TemplateView {
  return {
    id: template.id,
    name: template.name,
    blocks: template.blocks.map((block) => {
      const activity = block.activityId ? getActivityById(block.activityId) : undefined;
      return {
        id: block.id,
        activityName: block.title,
        categoryColor: activity?.color ? resolveCategoryColor(activity.color) : null,
        categoryIcon: activity?.icon ?? null,
        anchorRatio: block.anchorMinute / MINUTES_PER_DAY,
        medianDurationRatio: block.previewDurationMinutes / MINUTES_PER_DAY,
      };
    }),
  };
}
