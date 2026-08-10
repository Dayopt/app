'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * Stripe Checkout 成功復帰直後の有限ポーリング状態。
 *
 * `settings/[category]/page.tsx` が checkout success 復帰を検出した時に `start()` を
 * 呼ぶ。`useAppInlineBanner` 側の `billing.getOverview` query がこの `startedAt` を見て
 * refetchInterval を有効化し、`shouldContinueBillingPoll`（`../lib/billing-poll`）が
 * false を返した時点で `stop()` する。
 *
 * PC 復帰は `openSettings` + `router.replace` で query が消えるが、これは SPA 内の
 * client navigation でフルリロードは起きないため、この store の状態は
 * 遷移をまたいで保持される。永続化はしない（タブを跨いで古い開始時刻を
 * 引き継ぐ意味がなく、むしろ誤ってポーリングが再開する害の方が大きい）。
 */
interface BillingPollState {
  /** ポーリング開始時刻（epoch ms）。null は非アクティブ */
  startedAt: number | null;
  /** checkout success 復帰を検出した時に呼ぶ */
  start: () => void;
  /** Pro 反映確認 or タイムアウトで呼ぶ */
  stop: () => void;
}

const useBillingPollStoreBase = create<BillingPollState>()(
  devtools(
    (set) => ({
      startedAt: null,
      start: () => set({ startedAt: Date.now() }, false, 'start'),
      stop: () => set({ startedAt: null }, false, 'stop'),
    }),
    { name: 'billing-poll-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const useBillingPollStore = createSelectors(useBillingPollStoreBase);
