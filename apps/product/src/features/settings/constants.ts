import {
  CreditCard,
  Database,
  Monitor,
  Plug,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react';

import type { SettingsCategory } from './types';

/**
 * 設定カテゴリのメタデータ
 * アイコンと翻訳キーを定義
 */
interface SettingsCategoryMeta {
  id: SettingsCategory;
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
}

/**
 * 設定カテゴリの定義（6カテゴリ）
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategoryMeta[] = [
  {
    id: 'profile',
    icon: User,
    labelKey: 'settings.dialog.categories.profile',
    descKey: 'settings.dialog.categories.profileDesc',
  },
  {
    id: 'display',
    icon: Monitor,
    labelKey: 'settings.dialog.categories.display',
    descKey: 'settings.dialog.categories.displayDesc',
  },
  {
    id: 'data',
    icon: Database,
    labelKey: 'settings.dialog.categories.data',
    descKey: 'settings.dialog.categories.dataDesc',
  },
  {
    id: 'integrations',
    icon: Plug,
    labelKey: 'settings.dialog.categories.integrations',
    descKey: 'settings.dialog.categories.integrationsDesc',
  },
  {
    id: 'billing',
    icon: CreditCard,
    labelKey: 'settings.dialog.categories.billing',
    descKey: 'settings.dialog.categories.billingDesc',
  },
  {
    id: 'account',
    icon: SettingsIcon,
    labelKey: 'settings.dialog.categories.account',
    descKey: 'settings.dialog.categories.accountDesc',
  },
] as const;
