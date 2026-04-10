/**
 * i18nモジュールのエントリポイント
 */
export { IntlProvider } from './IntlProvider';
export { routing } from './routing';
export type { Locale } from './routing';
export * from './types';

/**
 * メッセージオブジェクトから指定したnamespaceだけを抽出する
 * NextIntlClientProvider に渡すメッセージをルートグループ単位でフィルタリングするために使用
 */
export function pickMessages(
  messages: Record<string, unknown>,
  namespaces: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const ns of namespaces) {
    if (ns in messages) {
      picked[ns] = messages[ns];
    }
  }
  return picked;
}
