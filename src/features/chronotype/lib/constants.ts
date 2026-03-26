import type {
  ChronotypeProfile,
  PresetChronotypeType,
  ProductivityLevel,
} from '@/types/chronotype';

/** 生産性レベルの表示順 */
export const CHRONOTYPE_LEVEL_ORDER: ProductivityLevel[] = [
  'warmup',
  'peak',
  'dip',
  'recovery',
  'winddown',
];

/** ユーザーが選択可能なプリセットクロノタイプの一覧 */
export const CHRONOTYPE_SELECTABLE_TYPES: PresetChronotypeType[] = [
  'bear',
  'lion',
  'wolf',
  'dolphin',
];

/** クロノタイプ別の絵文字マッピング */
export const CHRONOTYPE_EMOJI: Record<PresetChronotypeType, string> = {
  lion: '🦁',
  bear: '🐻',
  wolf: '🐺',
  dolphin: '🐬',
};

/** プリセットクロノタイプのプロフィール定義 */
export const CHRONOTYPE_PRESETS: Record<ChronotypeProfile['type'], ChronotypeProfile> = {
  lion: {
    type: 'lion',
    name: 'Lion',
    description:
      '目覚まし不要で早朝に自然と起きる超朝型。午前中にエネルギーがピークを迎え、夕方以降は早めに眠くなる。楽観的で規律正しく、目標志向。人口の約15-20%。',
    productivityZones: [
      { startHour: 5, endHour: 7, level: 'warmup', label: 'ウォームアップ' },
      { startHour: 7, endHour: 12, level: 'peak', label: 'ピーク' },
      { startHour: 12, endHour: 14, level: 'dip', label: 'ディップ' },
      { startHour: 14, endHour: 17, level: 'recovery', label: 'リカバリー' },
      { startHour: 17, endHour: 21, level: 'winddown', label: 'ウインドダウン' },
    ],
  },
  bear: {
    type: 'bear',
    name: 'Bear',
    description:
      '太陽のリズムに沿った生活が自然にできる標準型。7時頃に起床し、午前中から午後前半にかけて生産性が高まる。9-5の生活スタイルに最も適応しやすい。人口の約55%。',
    productivityZones: [
      { startHour: 7, endHour: 10, level: 'warmup', label: 'ウォームアップ' },
      { startHour: 10, endHour: 14, level: 'peak', label: 'ピーク' },
      { startHour: 14, endHour: 16, level: 'dip', label: 'ディップ' },
      { startHour: 16, endHour: 19, level: 'recovery', label: 'リカバリー' },
      { startHour: 19, endHour: 23, level: 'winddown', label: 'ウインドダウン' },
    ],
  },
  wolf: {
    type: 'wolf',
    name: 'Wolf',
    description:
      '午前中は苦手で、夕方から夜にかけてエンジンがかかる夜型。深夜まで眠くならず、クリエイティブで感情豊か。アーティストやミュージシャンに多い。人口の約15%。',
    productivityZones: [
      { startHour: 10, endHour: 14, level: 'warmup', label: 'ウォームアップ' },
      { startHour: 14, endHour: 15, level: 'dip', label: 'ディップ' },
      { startHour: 15, endHour: 21, level: 'peak', label: 'ピーク' },
      { startHour: 21, endHour: 23, level: 'recovery', label: 'リカバリー' },
      { startHour: 23, endHour: 1, level: 'winddown', label: 'ウインドダウン' },
    ],
  },
  dolphin: {
    type: 'dolphin',
    name: 'Dolphin',
    description:
      '睡眠が浅く不規則なパターンを持つ。午前中に集中力がピークを迎え、午後は低調になりやすい。知能が高く、慎重で完璧主義な傾向。人口の約10%。',
    productivityZones: [
      { startHour: 6, endHour: 8, level: 'warmup', label: 'ウォームアップ' },
      { startHour: 8, endHour: 12, level: 'peak', label: 'ピーク' },
      { startHour: 12, endHour: 14, level: 'dip', label: 'ディップ' },
      { startHour: 14, endHour: 17, level: 'recovery', label: 'リカバリー' },
      { startHour: 17, endHour: 22, level: 'winddown', label: 'ウインドダウン' },
    ],
  },
  custom: {
    type: 'custom',
    name: 'Custom',
    description: '自分だけのリズムを設定できます',
    productivityZones: [],
  },
};

/** 生産性レベル別の半透明背景クラス（カレンダー背景表示用） */
export const CHRONOTYPE_LEVEL_TINT_CLASSES: Record<ProductivityLevel, string> = {
  warmup: 'bg-chronotype-tint-warmup',
  peak: 'bg-chronotype-tint-peak',
  dip: 'bg-chronotype-tint-dip',
  recovery: 'bg-chronotype-tint-recovery',
  winddown: 'bg-chronotype-tint-winddown',
};
