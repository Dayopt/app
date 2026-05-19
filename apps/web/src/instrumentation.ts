/**
 * Next.js instrumentation hook
 *
 * server start 時に 1 度だけ呼ばれる。public marketing pages の static
 * build 中には呼ばれないため、production secret の存在検証はここで行う。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import { assertProductionRuntimeEnv } from '@/platform/config/env';

export function register(): void {
  // Node.js runtime のみで実行（edge runtime では env 検証スキップ）
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  assertProductionRuntimeEnv();
}
