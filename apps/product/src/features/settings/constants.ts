import { CreditCard, Database, Monitor, Plug, User, type LucideIcon } from 'lucide-react';

import type { MessageKey } from '@/lib/i18n';

import type { SettingsCategory } from './types';

/**
 * 設定カテゴリのメタデータ
 * アイコンと翻訳キーを定義
 */
interface SettingsCategoryMeta {
  id: SettingsCategory;
  icon: LucideIcon;
  labelKey: MessageKey;
  descKey: MessageKey;
}

/**
 * 設定カテゴリの定義（5カテゴリ）
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategoryMeta[] = [
  {
    id: 'account',
    icon: User,
    labelKey: 'settings.dialog.categories.account',
    descKey: 'settings.dialog.categories.accountDesc',
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
] as const;
