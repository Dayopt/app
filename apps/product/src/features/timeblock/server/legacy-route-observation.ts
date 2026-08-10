import * as Sentry from '@sentry/nextjs';

import { logger } from '@/lib/logger';
import { protectedProcedure } from '@/lib/trpc/procedures';

/**
 * 候補8 Stage 8-1 の観測窓の主指標（docs/projects/mcp-plan-track-learn/
 * step-6-candidate-8-cleanup.md §Stage 8-1）。
 *
 * legacy route（plansRouter / recordsRouter の mutation）が呼ばれた事実を
 * 2 経路で残す。永続記録は Sentry event（保持 90 日 > 観測窓 14 日。issue の
 * event 件数が累積 counter になる）、即時確認は logger.warn（Vercel runtime
 * logs。retention が短く 14 日窓の判定には使わない）。無出力の tRPC request は
 * runtime logs に現れないため、request path 検索では zero-use を判定できない。
 * 挙動は変えない（記録のみ）。path 以外の入力は記録しない。
 * 8-1 の legacy route 削除と同じ PR でこのファイルも消す。
 */
export const legacyTimeblockMutationProcedure = protectedProcedure.use(async ({ path, next }) => {
  logger.warn('legacy_timeblock_route_invoked', { path });
  Sentry.withScope((scope) => {
    // tag key は observability の allowlist（sanitizeTags）に載っている
    // `operation` を使う。allowlist 外の独自 key は production の beforeSend で
    // 削除され、procedure 別の絞り込みができなくなる。
    scope.setTag('operation', path);
    Sentry.captureMessage('legacy_timeblock_route_invoked', 'warning');
  });
  return next();
});
