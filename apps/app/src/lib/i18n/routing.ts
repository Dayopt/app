import { defineRouting } from 'next-intl/routing';

/** next-intlのルーティング設定（サポート言語・デフォルト言語・URLプレフィックス戦略） */
export const routing = defineRouting({
  // サポートする言語一覧
  locales: ['en', 'ja'],

  // デフォルト言語
  defaultLocale: 'en',

  // URLパス戦略: デフォルト言語(en)はプレフィックスなし
  // 例: / → 英語, /ja → 日本語
  localePrefix: 'as-needed',
});

/** サポートされているロケールの型（'en' | 'ja'） */
export type Locale = (typeof routing.locales)[number];
