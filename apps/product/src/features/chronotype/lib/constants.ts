import type { ChronotypeProfile, PresetChronotypeType } from '../types/chronotype';

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
      { startHour: 8, endHour: 12, level: 'deep', label: 'ピーク' },
      { startHour: 14, endHour: 17, level: 'ease', label: 'ディップ' },
    ],
  },
  bear: {
    type: 'bear',
    name: 'Bear',
    description:
      '太陽のリズムに沿った生活が自然にできる標準型。7時頃に起床し、午前中から午後前半にかけて生産性が高まる。9-5の生活スタイルに最も適応しやすい。人口の約55%。',
    productivityZones: [
      { startHour: 10, endHour: 14, level: 'deep', label: 'ピーク' },
      { startHour: 15, endHour: 17, level: 'ease', label: 'ディップ' },
    ],
  },
  wolf: {
    type: 'wolf',
    name: 'Wolf',
    description:
      '午前中は苦手で、夕方から夜にかけてエンジンがかかる夜型。深夜まで眠くならず、クリエイティブで感情豊か。アーティストやミュージシャンに多い。人口の約15%。',
    productivityZones: [
      { startHour: 10, endHour: 13, level: 'ease', label: 'ディップ' },
      { startHour: 17, endHour: 21, level: 'deep', label: 'ピーク' },
    ],
  },
  dolphin: {
    type: 'dolphin',
    name: 'Dolphin',
    description:
      '睡眠が浅く不規則なパターンを持つ。午前中に集中力がピークを迎え、午後は低調になりやすい。知能が高く、慎重で完璧主義な傾向。人口の約10%。',
    productivityZones: [
      { startHour: 10, endHour: 12, level: 'deep', label: 'ピーク' },
      { startHour: 14, endHour: 16, level: 'ease', label: 'ディップ' },
    ],
  },
};
