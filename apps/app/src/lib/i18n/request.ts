import { readdir } from 'fs/promises';
import { join } from 'path';

import { getRequestConfig } from 'next-intl/server';

import { logger } from '@/lib/logger';

import { routing } from './routing';

/**
 * messages/{locale}/ 内の .json ファイルからネームスペースを自動検出
 * 手動登録が不要なため、ファイル追加だけで新しいネームスペースが有効になる
 * 結果はプロセス内でキャッシュ（ファイル一覧は起動中変わらない）
 */
const namespaceCache = new Map<string, string[]>();

async function discoverNamespaces(locale: string): Promise<string[]> {
  const cached = namespaceCache.get(locale);
  if (cached) return cached;

  const dir = join(process.cwd(), 'messages', locale);
  const files = await readdir(dir);
  const namespaces = files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  namespaceCache.set(locale, namespaces);
  return namespaces;
}

/**
 * 全ネームスペースをロードしてマージ
 */
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const namespaces = await discoverNamespaces(locale);
  const messages: Record<string, unknown> = {};

  const namespaceModules = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`../../../messages/${locale}/${ns}.json`);
        return { namespace: ns, data: mod.default };
      } catch {
        logger.warn(`Failed to load namespace: ${ns} for locale: ${locale}`);
        return { namespace: ns, data: {} };
      }
    }),
  );

  for (const { data } of namespaceModules) {
    Object.assign(messages, data);
  }

  return messages;
}

/** next-intlのリクエスト設定 — ロケールとメッセージをリクエストごとに解決する */
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
