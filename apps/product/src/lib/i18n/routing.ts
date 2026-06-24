import { DEFAULT_LOCALE, LOCALE_PREFIX, SUPPORTED_LOCALES } from '@dayopt/config';
import { defineRouting } from 'next-intl/routing';

/** next-intlのルーティング設定（locale 定義は @dayopt/config が source of truth） */
export const routing = defineRouting({
  // サポートする言語一覧
  locales: SUPPORTED_LOCALES,

  // デフォルト言語
  defaultLocale: DEFAULT_LOCALE,

  // URLパス戦略: デフォルト言語(en)はプレフィックスなし
  // 例: / → 英語, /ja → 日本語
  localePrefix: LOCALE_PREFIX,
});

/** サポートされているロケールの型（'en' | 'ja'） */
export type Locale = (typeof routing.locales)[number];
