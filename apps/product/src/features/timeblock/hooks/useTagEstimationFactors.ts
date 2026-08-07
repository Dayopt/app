'use client';

/**
 * 作成時フィードフォワード用のタグ別見積もり係数を引く hook。
 *
 * 係数は**タグ単位で draft の長さに依存しない**ので、query は 1 回だけ引いて
 * 掛け算は client の pure 関数（`projectActualMinutes`）で行う。draft の時間を
 * 動かすたびに query を撃つ必要は無く、debounce も要らない。
 */

import { useMemo } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';

import { projectActualMinutes } from '../domain/tag-estimation-factor';

interface TagEstimationProjection {
  /** draft の予定時間に係数を掛けた実時間（分、5 分刻み）。 */
  minutes: number;
  /** 中央値の元になった Plan 件数。`n >= 3` が保証されている。 */
  sampleCount: number;
}

interface TagEstimationFactors {
  /** 条件を満たさない場合は null。呼び出し側は null で何も描画しない。 */
  project: (tagId: string | null, draftMinutes: number) => TagEstimationProjection | null;
}

export function useTagEstimationFactors(): TagEstimationFactors {
  // 意図的に isError をハンドリングしない（`.claude/rules/quality.md` の
  // 「UI を描画する全 useQuery は ErrorState 必須」に対する明示的な例外）。
  // これは受動的なヒントで、取れなかった事実をユーザーに見せる価値が無く、
  // ErrorState を出すと ADR-026 の「静かに教える」トーンを壊す。
  // 失敗時は data が undefined のまま project() が null を返し、何も描画されない。
  const { data } = api.statistics.getTagEstimationFactors.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
  });

  const factorsByTagId = useMemo(
    () => new Map((data ?? []).map((entry) => [entry.tagId, entry])),
    [data],
  );

  return useMemo(
    () => ({
      project(tagId, draftMinutes) {
        if (tagId == null || draftMinutes <= 0) return null;
        const entry = factorsByTagId.get(tagId);
        if (!entry) return null;
        return {
          minutes: projectActualMinutes(entry.factor, draftMinutes),
          sampleCount: entry.sampleCount,
        };
      },
    }),
    [factorsByTagId],
  );
}
