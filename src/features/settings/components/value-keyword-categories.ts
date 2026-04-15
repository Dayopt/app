import type { ValueKeyword, ValueKeywordCategory } from '../types/personalization';
import { VALUE_KEYWORDS } from '../types/personalization';

/** カテゴリごとのキーワードマッピング（'all' は実行時に VALUE_KEYWORDS 全体を返す） */
export const KEYWORD_CATEGORY_MAP: Record<
  Exclude<ValueKeywordCategory, 'all'>,
  readonly ValueKeyword[]
> = {
  character: [
    'integrity',
    'courage',
    'honesty',
    'perseverance',
    'humility',
    'tolerance',
    'respect',
    'responsibility',
    'discipline',
    'loyalty',
  ],
  connection: [
    'compassion',
    'love',
    'kindness',
    'empathy',
    'cooperation',
    'teamwork',
    'connection',
    'trust',
  ],
  exploration: [
    'curiosity',
    'creativity',
    'learning',
    'wisdom',
    'growth',
    'challenge',
    'adventure',
    'passion',
  ],
  freedom: ['freedom', 'independence', 'playfulness', 'beauty', 'joy', 'humor', 'authenticity'],
  society: [
    'fairness',
    'justice',
    'peace',
    'diversity',
    'environmentalism',
    'contribution',
    'service',
    'tradition',
  ],
  stability: [
    'stability',
    'safety',
    'wellbeing',
    'balance',
    'simplicity',
    'achievement',
    'leadership',
    'gratitude',
    'hope',
  ],
};

/** カテゴリに対応するキーワード一覧を返す */
export function getKeywordsForCategory(category: ValueKeywordCategory): readonly ValueKeyword[] {
  if (category === 'all') {
    return VALUE_KEYWORDS;
  }
  return KEYWORD_CATEGORY_MAP[category];
}
