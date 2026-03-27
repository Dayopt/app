/**
 * AI Service Types
 *
 * AIチャットのコンテキスト組み立てに使用する型定義
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ChronotypeType } from '@/features/chronotype';
import type { Database } from '@/lib/database.types';

/** AIサービス用Supabaseクライアント型 */
export type AISupabaseClient = SupabaseClient<Database>;

/** AI プロバイダー識別子 */
export type AIProviderId = 'anthropic' | 'openai';

/** サポートするモデル名 */
export const SUPPORTED_MODELS: Record<AIProviderId, string[]> = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
};

/** デフォルトモデル */
export const DEFAULT_MODELS: Record<AIProviderId, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o-mini',
};

/** モデル情報（UI表示用） */
export interface ModelInfo {
  id: string;
  name: string;
  providerId: AIProviderId;
  description: string;
}

/** 選択可能なモデル一覧 */
export const MODEL_OPTIONS: ModelInfo[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    providerId: 'anthropic',
    description: 'Balanced performance',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    providerId: 'anthropic',
    description: 'Fast & affordable',
  },
  { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', description: 'Most capable' },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    providerId: 'openai',
    description: 'Fast & affordable',
  },
];

/** 今日のエントリー情報（AI向け簡略化） */
export interface AIContextEntry {
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  tags: string[];
}

/** 最近の過去エントリー情報（AI向け簡略化） */
export interface AIContextPastEntry {
  title: string;
  durationMinutes: number;
  fulfillmentScore: number | null;
  workedAt: string;
}

// ---------------------------------------------------------------------------
// 無料枠定数
// ---------------------------------------------------------------------------

/** 無料枠の月間リクエスト上限 */
export const FREE_TIER_MONTHLY_LIMIT = 30;

/** 無料枠で使用するモデル（Haiku 4.5 固定） */
export const FREE_TIER_MODEL = 'claude-haiku-4-5-20251001';

/** 無料枠の利用状況 */
export interface FreeTierUsage {
  used: number;
  limit: number;
}

/** AIコンテキスト全体 */
export interface AIContext {
  /** パーソナライゼーション */
  values: Record<string, { text: string; importance: number }>;
  rankedValues: string[];
  aiStyle: 'coach' | 'analyst' | 'friendly' | 'custom';
  aiCustomStylePrompt: string;

  /** 今日のスケジュール */
  todayEntries: AIContextEntry[];

  /** 最近の過去エントリー（直近7日） */
  recentEntries: AIContextPastEntry[];

  /** 今週の時間（分） */
  weeklyMinutes: {
    planned: number;
    actual: number;
  };

  /** コンテキスト情報 */
  timezone: string;
  chronotype: {
    type: ChronotypeType;
    enabled: boolean;
  };
  tags: { name: string; color: string }[];
}
