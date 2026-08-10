import { logger } from '@/lib/logger';
import { protectedProcedure } from '@/lib/trpc/procedures';

/**
 * 候補8 Stage 8-1 の観測窓の主指標（docs/projects/mcp-plan-track-learn/
 * step-6-candidate-8-cleanup.md §Stage 8-1）。
 *
 * legacy route（plansRouter / recordsRouter の mutation）が呼ばれた事実を
 * 構造化 warn で残す。無出力の tRPC request は Vercel runtime logs に
 * 現れないため、request path 検索ではなくこの log 行の件数で zero-use を
 * 判定する。挙動は変えない（ログ出力のみ）。path 以外の入力は記録しない。
 * 8-1 の legacy route 削除と同じ PR でこのファイルも消す。
 */
export const legacyTimeblockMutationProcedure = protectedProcedure.use(async ({ path, next }) => {
  logger.warn('legacy_timeblock_route_invoked', { path });
  return next();
});
