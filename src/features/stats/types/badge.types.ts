/**
 * Badge Feature Types
 */

/** バッジカテゴリ */
export type BadgeCategory = 'growth' | 'exploration' | 'pattern' | 'loyalty';

/** バッジランク（段階成長型のみ） */
export type BadgeRank = 'bronze' | 'silver' | 'gold';

/** 段階成長型バッジの閾値定義 */
export interface BadgeThreshold {
  rank: BadgeRank;
  value: number;
}

/** バッジ定義（フロントエンド定数） */
export interface BadgeDefinition {
  id: string;
  category: BadgeCategory;
  nameKey: string;
  descriptionKey: string;
  hintKey?: string;
  icon: string;
  isTiered: boolean;
  thresholds?: BadgeThreshold[];
  link?: string;
}

/** ユーザーが獲得したバッジ（DBレコード） */
export interface UserBadge {
  id: string;
  badgeId: string;
  rank: BadgeRank | null;
  earnedAt: string;
}

/** バッジ進捗情報 */
export interface BadgeProgress {
  badgeId: string;
  currentValue: number;
  targetValue: number;
  rank?: BadgeRank;
}

/** 新規獲得バッジ（evaluate結果） */
export interface NewlyEarnedBadge {
  badgeId: string;
  rank: BadgeRank | null;
}

/** バッジ表示用の統合型 */
export interface BadgeWithStatus {
  definition: BadgeDefinition;
  earned: boolean;
  userBadge?: UserBadge;
  progress?: BadgeProgress;
  currentRank?: BadgeRank;
}
