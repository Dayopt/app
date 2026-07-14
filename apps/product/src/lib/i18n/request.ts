import { readdir } from 'fs/promises';
import { join } from 'path';

import { createI18nRequestConfig } from '@dayopt/i18n/request';
import type { Locale } from '@dayopt/i18n/routing';

import { logger } from '@/lib/logger';

/**
 * messages/{locale}/ 内の .json ファイルからネームスペースを自動検出
 * 手動登録が不要なため、ファイル追加だけで新しいネームスペースが有効になる
 * 結果はプロセス内でキャッシュ（ファイル一覧は起動中変わらない）
 */
const namespaceCache = new Map<string, string[]>();

async function discoverNamespaces(locale: Locale): Promise<string[]> {
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
async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
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
export default createI18nRequestConfig(loadMessages);
