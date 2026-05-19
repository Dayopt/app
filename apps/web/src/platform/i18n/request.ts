import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/**
 * ネームスペース一覧
 * messages/{locale}/{namespace}.json として配置
 */
const NAMESPACES = ['common', 'legal', 'marketing', 'search'] as const;

/**
 * 全ネームスペースをロードしてマージ
 */
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const messages: Record<string, unknown> = {};

  const namespaceModules = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        const mod = await import(`../../../messages/${locale}/${ns}.json`);
        return { namespace: ns, data: mod.default };
      } catch {
        console.warn(`Failed to load namespace: ${ns} for locale: ${locale}`);
        return { namespace: ns, data: {} };
      }
    }),
  );

  for (const { data } of namespaceModules) {
    Object.assign(messages, data);
  }

  return messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale は通常、ミドルウェアから提供される
  let locale = await requestLocale;

  // 無効またはサポートされていない言語の場合、デフォルトにフォールバック
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
