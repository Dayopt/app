/**
 * サンプルエントリー定義
 *
 * オンボーディング完了時にクロノタイプのピーク時間帯に基づいて
 * プリセットタグ + サンプルエントリを自動配置する。
 */

import type { PresetChronotypeType } from '@/lib/types/chronotype';

// ─────────────────────────────────────────────────────────
// プリセットタグ
// ─────────────────────────────────────────────────────────

export type PresetTagKey = 'work' | 'learning' | 'life' | 'exercise' | 'hobby';

export interface PresetTagDefinition {
  name: string;
  color: string;
}

/** オンボーディング時に自動作成されるプリセットタグ */
export const PRESET_TAGS: Record<PresetTagKey, PresetTagDefinition> = {
  work: { name: 'Work', color: 'blue' },
  learning: { name: 'Learning', color: 'green' },
  life: { name: 'Life', color: 'amber' },
  exercise: { name: 'Exercise', color: 'teal' },
  hobby: { name: 'Hobby', color: 'violet' },
};

// ─────────────────────────────────────────────────────────
// サンプルプランテンプレート
// ─────────────────────────────────────────────────────────

interface SampleEntryTemplate {
  title: string;
  offsetHours: number;
  durationMinutes: number;
  tagKey: PresetTagKey;
  description?: string;
}

/** クロノタイプ別のピーク開始時間 */
const PEAK_START_HOURS: Record<PresetChronotypeType, number> = {
  lion: 7,
  bear: 10,
  wolf: 15,
  dolphin: 8,
};

/**
 * サンプルプランテンプレート（全クロノタイプ共通）
 *
 * ピーク開始時刻を基準に相対配置。
 * 例: bear (peak=10:00) → Morning Run 08:00, Draft Proposal 10:00, ...
 */
const SAMPLE_TEMPLATES: SampleEntryTemplate[] = [
  { title: 'Morning Run', offsetHours: -2, durationMinutes: 30, tagKey: 'exercise' },
  {
    title: 'Draft Proposal',
    offsetHours: 0,
    durationMinutes: 90,
    tagKey: 'work',
  },
  {
    title: 'English Lesson',
    offsetHours: 1.75,
    durationMinutes: 45,
    tagKey: 'learning',
    description: 'Unit 5 — Pronunciation practice',
  },
  { title: 'Lunch & Walk', offsetHours: 3, durationMinutes: 45, tagKey: 'life' },
  { title: 'Prepare Presentation', offsetHours: 4.5, durationMinutes: 60, tagKey: 'work' },
  { title: 'Reading', offsetHours: 6, durationMinutes: 30, tagKey: 'hobby' },
  { title: 'Yoga', offsetHours: 8, durationMinutes: 45, tagKey: 'exercise' },
];

export interface GeneratedSampleEntry {
  title: string;
  startTime: string;
  endTime: string;
  tagKey: PresetTagKey;
  description: string | null;
}

/**
 * クロノタイプに基づいたサンプルプランを生成する
 *
 * @param chronotypeType - クロノタイプ（null の場合は bear をデフォルト使用）
 * @param date - プランを配置する日付
 * @returns サンプルプランの配列
 */
export function generateSampleEntries(
  chronotypeType: PresetChronotypeType | null,
  date: Date,
): GeneratedSampleEntry[] {
  const type = chronotypeType ?? 'bear';
  const peakStart = PEAK_START_HOURS[type];

  return SAMPLE_TEMPLATES.map((template) => {
    const startHour = peakStart + template.offsetHours;
    const startDate = new Date(date);
    startDate.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + template.durationMinutes);

    return {
      title: template.title,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      tagKey: template.tagKey,
      description: template.description ?? null,
    };
  });
}
