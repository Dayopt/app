/**
 * Storybook用 next-intl/routing モック
 */
export function defineRouting(config: Record<string, unknown>) {
  return {
    locales: (config.locales as string[]) ?? ['en', 'ja'],
    defaultLocale: (config.defaultLocale as string) ?? 'en',
    ...config,
  };
}
