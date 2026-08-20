/**
 * activity 別見積もり係数（作成時フィードフォワードの燃料）の pure aggregation。
 *
 * ADR-026（`docs/product/log/2026-07-10-analytics-expression-policy.md`）の 3 点のうち
 * 1 点目「タグ別見積もり係数」の定義を、tag_id → activity_id へキーを置換して実装する
 * （`docs/projects/tag-model-replacement/step-5-7-completion.md` §4-2）:
 *
 * - Plan 1 件ごとに `Σ(Record duration) ÷ Plan duration` の比を **1 つ**作る（1 Plan : N Record は合算）
 * - activity は **Plan 側の `activity_id`** で束ねる。作成時に draft の activity で引くため、計上キーと参照キーを一致させる
 *   （Review 表示の「Record 側 activity 優先」とは用途が異なる別の決定であり、矛盾ではない）
 * - 直近 4 週の **中央値**。平均は 1 回の大事故に引きずられ、「静かに教える」トーンと相性が悪い
 * - サンプル `n >= 3` 未満の activity は返さない（根拠の薄い数字を出さない）
 *
 * 期間の絞り込みは呼び出し側（server の fetcher）が `plans.start_at` に対して行う。
 * この module は渡された行だけを見る。
 */

/** 集計対象の Plan 行。期間フィルタ適用後のものを渡す。 */
export interface ActivityEstimationPlanRow {
  id: string;
  activity_id: string | null;
  planned_minutes: number;
  /** `plans.skipped_at != null` — やらなかった Plan は分母から外す。 */
  is_skipped: boolean;
}

/** 集計対象の Record 行。`plan_id` で Plan に紐づくもの。 */
export interface ActivityEstimationRecordRow {
  plan_id: string | null;
  source: string;
  minutes: number;
}

/** activity 1 件分の見積もり係数。 */
export interface ActivityEstimationFactor {
  activityId: string;
  /** 実績 ÷ 予定 の中央値。1.0 で見積もりどおり、1.5 なら 1.5 倍かかっている。 */
  factor: number;
  /** 中央値の元になった Plan の件数。 */
  sampleCount: number;
}

/**
 * 移行で実体化しただけの Record。ユーザーが確定した実績ではないので分子から除外する
 * （`domain/estimation-accuracy.ts` と同じ扱い）。
 */
const AUTO_MIGRATED_SOURCE = 'auto_migrated';

/** ADR-026 の沈黙閾値。これ未満の activity は何も出さない。 */
export const MIN_ESTIMATION_SAMPLE_COUNT = 3;

/** 提示する実時間の丸め単位（分）。「45 分前後」の粒度に合わせる。 */
const PROJECTION_STEP_MINUTES = 5;

/** 偶数件は中央 2 件の平均を取る。入力は昇順にソート済みであること。 */
function median(sortedValues: readonly number[]): number {
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[middle] as number;
  return ((sortedValues[middle - 1] as number) + (sortedValues[middle] as number)) / 2;
}

/**
 * Plan / Record 行から activity 別の見積もり係数を作る。
 *
 * 分母から外れるもの:
 * - `is_skipped` の Plan（やらなかった）
 * - `planned_minutes <= 0` の Plan（比が定義できない）
 * - `activity_id` が null の Plan（作成時に引くキーが無いので提示先が存在しない）
 * - 紐づく Record が 1 件も無い Plan（未記録。ゼロ実績として扱うと係数が 0 に潰れる）
 *
 * 分子から外れるもの:
 * - `source = 'auto_migrated'` の Record
 * - `plan_id` を持たない Record（予定外の記録。どの Plan の実績でもない）
 */
export function aggregateActivityEstimationFactors(
  plans: ReadonlyArray<ActivityEstimationPlanRow>,
  records: ReadonlyArray<ActivityEstimationRecordRow>,
): ActivityEstimationFactor[] {
  const actualMinutesByPlanId = new Map<string, number>();
  for (const record of records) {
    if (record.plan_id == null || record.source === AUTO_MIGRATED_SOURCE) continue;
    actualMinutesByPlanId.set(
      record.plan_id,
      (actualMinutesByPlanId.get(record.plan_id) ?? 0) + record.minutes,
    );
  }

  const ratiosByActivityId = new Map<string, number[]>();
  for (const plan of plans) {
    if (plan.is_skipped) continue;
    if (plan.planned_minutes <= 0) continue;
    if (plan.activity_id == null) continue;

    const actualMinutes = actualMinutesByPlanId.get(plan.id);
    if (actualMinutes == null) continue;

    const ratios = ratiosByActivityId.get(plan.activity_id) ?? [];
    ratios.push(actualMinutes / plan.planned_minutes);
    ratiosByActivityId.set(plan.activity_id, ratios);
  }

  return Array.from(ratiosByActivityId.entries())
    .filter(([, ratios]) => ratios.length >= MIN_ESTIMATION_SAMPLE_COUNT)
    .map(([activityId, ratios]) => ({
      activityId,
      factor: median([...ratios].sort((a, b) => a - b)),
      sampleCount: ratios.length,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.activityId.localeCompare(b.activityId));
}

/**
 * 係数を draft の予定時間に掛けて、提示する実時間（分）を作る。
 *
 * 比率（1.5x）ではなく実時間で出すのは ADR-026 の決定。比は計器っぽく認知負荷が高く、
 * 「45 分前後」は次の入力を直接助ける。
 *
 * 5 分刻みに丸め、下限は 5 分（0 分と表示しない）。
 */
export function projectActualMinutes(factor: number, draftMinutes: number): number {
  const projected = factor * draftMinutes;
  const rounded = Math.round(projected / PROJECTION_STEP_MINUTES) * PROJECTION_STEP_MINUTES;
  return Math.max(PROJECTION_STEP_MINUTES, rounded);
}
