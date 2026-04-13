/**
 * AI Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Server (server-only ガードで保護済み) ---
export { buildAIContext } from './server/context-service';
export { buildSystemPrompt } from './server/prompt-builder';
export { createAITools } from './server/tools';
export {
  DEFAULT_MODELS,
  FREE_TIER_MODEL,
  FREE_TIER_MONTHLY_LIMIT,
  SUPPORTED_MODELS,
} from './server/types';
export type { AIContext, AIProviderId, FreeTierUsage } from './server/types';
export { createAIUsageService } from './server/usage-service';

// ここにないものはfeature内部専用
