import type { PresetChronotypeType } from '../types/chronotype';

/** 各選択肢のスコア配分 */
export interface QuizOptionScores {
  lion: number;
  bear: number;
  wolf: number;
  dolphin: number;
}

/** クイズの1問 */
export interface ChronotypeQuizQuestion {
  /** i18nキーのサフィックス (e.g., "wakeTime") */
  id: string;
  /** 選択肢のi18nキーサフィックスとスコア */
  options: Array<{
    id: string;
    scores: QuizOptionScores;
  }>;
}

/** 6問の診断クイズ */
/** 6問の診断クイズ質問リスト */
export const CHRONOTYPE_QUIZ_QUESTIONS: ChronotypeQuizQuestion[] = [
  {
    // Q1: 目覚ましなしの自然な起床時間
    id: 'wakeTime',
    options: [
      { id: 'early', scores: { lion: 3, bear: 1, wolf: 0, dolphin: 1 } },
      { id: 'moderate', scores: { lion: 1, bear: 3, wolf: 0, dolphin: 1 } },
      { id: 'late', scores: { lion: 0, bear: 1, wolf: 3, dolphin: 0 } },
      { id: 'irregular', scores: { lion: 0, bear: 0, wolf: 1, dolphin: 3 } },
    ],
  },
  {
    // Q2: 午前中のエネルギーレベル
    id: 'morningEnergy',
    options: [
      { id: 'veryHigh', scores: { lion: 3, bear: 1, wolf: 0, dolphin: 1 } },
      { id: 'gradual', scores: { lion: 1, bear: 3, wolf: 0, dolphin: 1 } },
      { id: 'low', scores: { lion: 0, bear: 0, wolf: 3, dolphin: 1 } },
      { id: 'anxious', scores: { lion: 0, bear: 0, wolf: 0, dolphin: 3 } },
    ],
  },
  {
    // Q3: 最も集中できる時間帯
    id: 'deepFocus',
    options: [
      { id: 'earlyMorning', scores: { lion: 3, bear: 0, wolf: 0, dolphin: 1 } },
      { id: 'lateMorning', scores: { lion: 1, bear: 3, wolf: 0, dolphin: 1 } },
      { id: 'afternoon', scores: { lion: 0, bear: 1, wolf: 3, dolphin: 0 } },
      { id: 'evening', scores: { lion: 0, bear: 0, wolf: 3, dolphin: 1 } },
    ],
  },
  {
    // Q4: 午後の眠気パターン
    id: 'afternoonEase',
    options: [
      { id: 'earlyEase', scores: { lion: 3, bear: 1, wolf: 0, dolphin: 0 } },
      { id: 'normalEase', scores: { lion: 1, bear: 3, wolf: 0, dolphin: 1 } },
      { id: 'noEase', scores: { lion: 0, bear: 0, wolf: 3, dolphin: 1 } },
      { id: 'unpredictable', scores: { lion: 0, bear: 0, wolf: 1, dolphin: 3 } },
    ],
  },
  {
    // Q5: 理想的な就寝時間
    id: 'bedTime',
    options: [
      { id: 'early', scores: { lion: 3, bear: 1, wolf: 0, dolphin: 0 } },
      { id: 'normal', scores: { lion: 1, bear: 3, wolf: 0, dolphin: 1 } },
      { id: 'late', scores: { lion: 0, bear: 0, wolf: 3, dolphin: 1 } },
      { id: 'inconsistent', scores: { lion: 0, bear: 0, wolf: 1, dolphin: 3 } },
    ],
  },
  {
    // Q6: 睡眠の質
    id: 'sleepQuality',
    options: [
      { id: 'deepSleep', scores: { lion: 3, bear: 1, wolf: 1, dolphin: 0 } },
      { id: 'normalSleep', scores: { lion: 1, bear: 3, wolf: 1, dolphin: 0 } },
      { id: 'nightOwl', scores: { lion: 0, bear: 0, wolf: 3, dolphin: 1 } },
      { id: 'lightSleep', scores: { lion: 0, bear: 0, wolf: 0, dolphin: 3 } },
    ],
  },
];

/** クイズの回答からクロノタイプを判定する */
export function calculateChronotypeResult(answers: Record<string, string>): PresetChronotypeType {
  const totals: QuizOptionScores = { lion: 0, bear: 0, wolf: 0, dolphin: 0 };

  for (const question of CHRONOTYPE_QUIZ_QUESTIONS) {
    const selectedOptionId = answers[question.id];
    if (!selectedOptionId) continue;

    const option = question.options.find((o) => o.id === selectedOptionId);
    if (!option) continue;

    totals.lion += option.scores.lion;
    totals.bear += option.scores.bear;
    totals.wolf += option.scores.wolf;
    totals.dolphin += option.scores.dolphin;
  }

  // 最高スコアのタイプを返す（同点の場合はbearをデフォルト）
  const entries = Object.entries(totals) as Array<[PresetChronotypeType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? 'bear';
}

/** クイズの総問題数 */
export const QUIZ_QUESTION_COUNT = CHRONOTYPE_QUIZ_QUESTIONS.length;
