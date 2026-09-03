'use client';

import { useMemo } from 'react';

import { useReportViewStore } from '../stores/useReportViewStore';
import { useSegments } from './useSegments';

/**
 * 選択中のセグメントレンズを 1 箇所で解決する。
 *
 * `segmentId` は端末ローカルに永続化されるので、別タブ・別端末で消されたセグメントを
 * 指したままになりうる。**縮退の判断をここへ集約する** — 1 章・セグメント一覧・
 * カテゴリーフィルタが別々に判定すると、「どこにもレンズが見えないのに余白行だけ
 * 無効化されたまま」のような食い違いが起きる。
 *
 * 縮退では store を書き戻さない（描画中の setState を避ける）。ユーザーが「すべて」を
 * 押すか別のセグメントを選んだ時に、通常の経路で上書きされる。
 */
export function useActiveSegment(): {
  /** レンズ。`null` は「すべて」。 */
  activeSegment: { id: string; name: string; activityIds: string[] } | null;
  /**
   * 保存された `segmentId` の生死がまだ決まらない。
   *
   * ここで待たないと、`listSegments` が `getReportPeriod` より遅い初回ロードで
   * 「余白込み・カテゴリー別」の数字が一瞬出てからレンズ後の数字へ飛ぶ。
   * 取得に失敗した場合は `false` になり、3 面そろって「すべて」へ縮退する。
   */
  isResolving: boolean;
} {
  const segmentId = useReportViewStore((state) => state.segmentId);
  const { data: segments, isPending } = useSegments();

  const activeSegment = useMemo(
    () => segments?.find((segment) => segment.id === segmentId) ?? null,
    [segments, segmentId],
  );

  return { activeSegment, isResolving: segmentId !== null && isPending };
}
