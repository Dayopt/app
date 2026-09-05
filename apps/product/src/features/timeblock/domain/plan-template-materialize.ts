/**
 * テンプレート（型）を 1 日へ具現化する pure function（#2567）。
 *
 * 入力は組成・順序・錨位置だけ（寸法無し）。各ブロックの長さは
 * `min(activity の中央値 or 既定長, 次の錨まで, その日の終わり)` で決め、5 分未満に
 * なるブロックがあれば**適用全体を拒否**する（組成を黙って欠かさない）。
 * 既存 Plan との重なりはここでは見ない — DB の `plans_no_overlap` が最終権威で、
 * 1 件でも重なれば bulk command が全件 rollback する。
 *
 * archived な activity は `activityId = null` で title だけ保って具現化する
 * （ブロックを skip して組成を減らさない。hard delete 済みは保存時点で FK が NULL にしている）。
 *
 * プレビュー（Sidebar の hover）と適用は同じ `resolveTemplateBlockMinutes` を通るので、
 * 見えている長さと置かれる長さが一致する（DST 日の instant clip だけが適用側の追加分）。
 */

import {
  anchorMinuteToInstant,
  dayEndInstant,
  MINUTES_PER_DAY,
  minutesBetweenInstants,
} from './plan-template-anchor';
import {
  MIN_TEMPLATE_BLOCK_MINUTES,
  normalizeTemplateBlockMinutes,
} from './plan-template-duration';

export interface TemplateBlockShape {
  id: string;
  activityId: string | null;
  title: string;
  anchorMinute: number;
}

interface MaterializedTemplatePlan {
  blockId: string;
  activityId: string | null;
  title: string;
  startAt: string;
  endAt: string;
}

type PlanTemplateMaterializeErrorCode = 'EMPTY_TEMPLATE' | 'BLOCK_TOO_SHORT';

export class PlanTemplateMaterializeError extends Error {
  constructor(
    public readonly code: PlanTemplateMaterializeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlanTemplateMaterializeError';
  }
}

interface PositionedTemplateBlock {
  id: string;
  activityId: string | null;
  /** その日の始まりからの分。プレビューでは `anchorMinute`、適用では instant から測る */
  positionMinutes: number;
  /**
   * 中央値 / 既定長の代わりに使う長さ（分）。client の楽観的更新が、`list` で受け取った
   * `previewDurationMinutes` をそのまま渡すために使う（同じ計算を client で再現しない）。
   */
  preferredMinutes?: number | undefined;
}

/**
 * 各ブロックの長さ（分）。`min(中央値 or 既定, 次のブロックまで, 日の長さまで)`。
 * 5 分丸め・上限は `normalizeTemplateBlockMinutes` が既に掛けている前提で、ここでは
 * clip だけ行う。プレビューと適用の両方がこの値を使う。
 *
 * 位置は「その日の始まりからの分」で受ける。プレビューは錨位置そのもの、適用は
 * DST 解決後の instant から測った分を渡す（gap 日は錨順と instant 順が入れ替わりうるので、
 * 適用側は instant で並べ直してから渡す）。`dayLengthMinutes` は 23h / 25h 日で変わる。
 */
export function resolveTemplateBlockMinutes(
  blocks: ReadonlyArray<PositionedTemplateBlock>,
  medianMinutesByActivity: ReadonlyMap<string, number>,
  defaultMinutes: number,
  dayLengthMinutes: number = MINUTES_PER_DAY,
): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.positionMinutes - b.positionMinutes);
  const fallback = normalizeTemplateBlockMinutes(defaultMinutes);
  const result = new Map<string, number>();
  sorted.forEach((block, index) => {
    const preferred =
      block.preferredMinutes ??
      (block.activityId ? medianMinutesByActivity.get(block.activityId) : undefined) ??
      fallback;
    const next = sorted[index + 1];
    const untilNext = (next ? next.positionMinutes : dayLengthMinutes) - block.positionMinutes;
    result.set(block.id, Math.min(preferred, untilNext));
  });
  return result;
}

interface MaterializeTemplateDayInput {
  blocks: ReadonlyArray<TemplateBlockShape>;
  /** 適用先の暦日（yyyy-MM-dd、ユーザー timezone） */
  dateKey: string;
  timezone: string;
  medianMinutesByActivity: ReadonlyMap<string, number>;
  /** `user_settings.default_duration`。中央値が無い activity / 未分類ブロックに着せる */
  defaultMinutes: number;
  archivedActivityIds: ReadonlySet<string>;
  /**
   * block id → 長さ（分）。与えた block は中央値 / 既定長より優先される（clip は同じく掛かる）。
   * client の楽観的更新が `list` の `previewDurationMinutes` をそのまま使うための入口。
   */
  preferredMinutesByBlockId?: ReadonlyMap<string, number> | undefined;
}

/**
 * 型を 1 日分の Plan 行（start / end は UTC ISO）へ具現化する。
 *
 * @throws PlanTemplateMaterializeError 空の型、または clip 後に 5 分未満になるブロックがある時
 */
export function materializeTemplateDay(
  input: MaterializeTemplateDayInput,
): MaterializedTemplatePlan[] {
  if (input.blocks.length === 0) {
    throw new PlanTemplateMaterializeError('EMPTY_TEMPLATE', 'Template has no blocks');
  }

  const dayStart = anchorMinuteToInstant(input.dateKey, 0, input.timezone);
  const dayEnd = dayEndInstant(input.dateKey, input.timezone);
  const positioned = input.blocks
    .map((block) => {
      const start = anchorMinuteToInstant(input.dateKey, block.anchorMinute, input.timezone);
      return { block, start, positionMinutes: minutesBetweenInstants(dayStart, start) };
    })
    // gap 日は錨順と instant 順が入れ替わりうる。置くのは instant 順
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() || a.block.anchorMinute - b.block.anchorMinute,
    );

  const minutesByBlock = resolveTemplateBlockMinutes(
    positioned.map(({ block, positionMinutes }) => ({
      id: block.id,
      activityId: block.activityId,
      positionMinutes,
      preferredMinutes: input.preferredMinutesByBlockId?.get(block.id),
    })),
    input.medianMinutesByActivity,
    input.defaultMinutes,
    minutesBetweenInstants(dayStart, dayEnd),
  );

  return positioned.map(({ block, start }) => {
    const minutes = minutesByBlock.get(block.id) ?? 0;
    if (minutes < MIN_TEMPLATE_BLOCK_MINUTES) {
      throw new PlanTemplateMaterializeError(
        'BLOCK_TOO_SHORT',
        `Block "${block.title}" would be shorter than ${MIN_TEMPLATE_BLOCK_MINUTES} minutes`,
      );
    }
    return {
      blockId: block.id,
      activityId:
        block.activityId && !input.archivedActivityIds.has(block.activityId)
          ? block.activityId
          : null,
      title: block.title,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    };
  });
}
