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

export const CATEGORY_ICONS: Record<PersonalizationCategory, LucideIcon> = {
  family: Users,
  romance: Heart,
  parenting: Baby,
  friends: UserPlus,
  career: Briefcase,
  selfGrowth: TrendingUp,
  leisure: Gamepad2,
  spirituality: Sparkles,
  community: Building2,
  health: Activity,
  environment: Leaf,
  finance: Wallet,
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
