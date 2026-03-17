/**
 * サンプルプラン定義
 *
 * オンボーディング完了時にクロノタイプのピーク時間帯に基づいて
 * サンプルプランを自動配置する。
 */

import type { PresetChronotypeType } from '@/types/chronotype';

/** サンプルプランのテンプレート */
interface SamplePlanTemplate {
  /** プランのタイトル */
  title: string;
  /** ピーク開始時刻からの相対オフセット（時間） */
  offsetHours: number;
  /** 継続時間（分） */
  durationMinutes: number;
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
 * 例: bear (peak=10:00) → 集中作業 10:00-11:30, メール 11:30-12:00, 休憩 12:00-12:30, 振り返り 12:30-13:00
 */
const SAMPLE_TEMPLATES: SamplePlanTemplate[] = [
  { title: 'Focus Work', offsetHours: 0, durationMinutes: 90 },
  { title: 'Email & Messages', offsetHours: 1.5, durationMinutes: 30 },
  { title: 'Break', offsetHours: 2, durationMinutes: 30 },
  { title: 'Afternoon Work', offsetHours: 2.5, durationMinutes: 60 },
];

interface GeneratedSamplePlan {
  title: string;
  startTime: string;
  endTime: string;
}

/**
 * クロノタイプに基づいたサンプルプランを生成する
 *
 * @param chronotypeType - クロノタイプ（null の場合は bear をデフォルト使用）
 * @param date - プランを配置する日付
 * @returns サンプルプランの配列
 */
export function generateSamplePlans(
  chronotypeType: PresetChronotypeType | null,
  date: Date,
): GeneratedSamplePlan[] {
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
    };
  });
}
