import { createI18nRequestConfig } from '@dayopt/i18n/request';
import type { Locale } from '@dayopt/i18n/routing';

/**
 * ネームスペース一覧
 * messages/{locale}/{namespace}.json として配置
 */
const NAMESPACES = ['common', 'legal', 'marketing', 'search'] as const;

/**
 * 全ネームスペースをロードしてマージ
 */
async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
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

export default createI18nRequestConfig(loadMessages);
