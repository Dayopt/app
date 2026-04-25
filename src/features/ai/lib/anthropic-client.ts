import 'server-only';

/**
 * Anthropic SDK Client — ai feature 内部専用 wrapper
 *
 * RP1 Option α の方針により `src/features/ai/lib/` に配置している。
 * 他 feature からは直接 import せず、ai feature の public API（tRPC procedure）経由で利用する。
 * SDK client を lib/ に格上げする場合は git mv + import 書き換えで対応する（overview RP1 参照）。
 *
 * ## Factory pattern（singleton を避ける理由）
 *
 * - module load 時に client を生成しない（side effect なし、テスト時の import が軽い）
 * - test 時の mock 差し替えが容易（factory を stub するだけ）
 * - BYOK 対応（watching-ai-implementation）で per-request に override key を受け取る形に拡張しやすい
 */

import Anthropic from '@anthropic-ai/sdk';

import { env } from '@/env';

// TODO(watching-ai-implementation): retry / logging / observability の追加
// TODO(watching-ai-implementation): BYOK 対応（引数に override key を受け取る）

export function createAnthropicClient(): Anthropic {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set it in .env.local or the Vercel environment.',
    );
  }

  return new Anthropic({ apiKey });
}
