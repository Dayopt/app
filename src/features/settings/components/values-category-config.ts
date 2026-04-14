import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Baby,
  Briefcase,
  Building2,
  Gamepad2,
  Heart,
  Leaf,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

import type { PersonalizationCategory } from '../types/personalization';

interface CategoryVisualConfig {
  icon: LucideIcon;
  /** bg-tag-*-tint クラス */
  tintBg: string;
  /** text-tag-* クラス */
  iconColor: string;
}

export const CATEGORY_VISUALS: Record<PersonalizationCategory, CategoryVisualConfig> = {
  family: { icon: Users, tintBg: 'bg-tag-red-tint', iconColor: 'text-tag-red' },
  romance: { icon: Heart, tintBg: 'bg-tag-pink-tint', iconColor: 'text-tag-pink' },
  parenting: { icon: Baby, tintBg: 'bg-tag-orange-tint', iconColor: 'text-tag-orange' },
  friends: { icon: UserPlus, tintBg: 'bg-tag-amber-tint', iconColor: 'text-tag-amber' },
  career: { icon: Briefcase, tintBg: 'bg-tag-blue-tint', iconColor: 'text-tag-blue' },
  selfGrowth: { icon: TrendingUp, tintBg: 'bg-tag-indigo-tint', iconColor: 'text-tag-indigo' },
  leisure: { icon: Gamepad2, tintBg: 'bg-tag-green-tint', iconColor: 'text-tag-green' },
  spirituality: { icon: Sparkles, tintBg: 'bg-tag-violet-tint', iconColor: 'text-tag-violet' },
  community: { icon: Building2, tintBg: 'bg-tag-teal-tint', iconColor: 'text-tag-teal' },
  health: { icon: Activity, tintBg: 'bg-tag-green-tint', iconColor: 'text-tag-green' },
  environment: { icon: Leaf, tintBg: 'bg-tag-teal-tint', iconColor: 'text-tag-teal' },
  finance: { icon: Wallet, tintBg: 'bg-tag-amber-tint', iconColor: 'text-tag-amber' },
};

/** 各カテゴリの例文チップ数 */
export const EXAMPLE_CHIP_COUNTS: Record<PersonalizationCategory, number> = {
  family: 3,
  romance: 2,
  parenting: 3,
  friends: 2,
  career: 3,
  selfGrowth: 3,
  leisure: 2,
  spirituality: 2,
  community: 2,
  health: 3,
  environment: 2,
  finance: 3,
};
