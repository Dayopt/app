/** アプリ横断で共有する locale 定義（public-safe）。canonical な対応言語一覧。 */
export const SUPPORTED_LOCALES = ['en', 'ja'] as const;

/** サポートされている locale の型（'en' | 'ja'） */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** デフォルト locale */
export const DEFAULT_LOCALE = 'en' as const;

/** next-intl の URL プレフィックス戦略（デフォルト言語はプレフィックスなし） */
export const LOCALE_PREFIX = 'as-needed' as const;
