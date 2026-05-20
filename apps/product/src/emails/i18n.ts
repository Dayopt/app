import enMessages from '../../messages/en/email.json';
import jaMessages from '../../messages/ja/email.json';

type EmailLocale = 'en' | 'ja';
type Messages = typeof enMessages;

const messages: Record<EmailLocale, Messages> = { en: enMessages, ja: jaMessages };

/**
 * メールテンプレート用の翻訳関数を生成
 *
 * next-intlはServer Component/Client Component用でメール（react-email）では使えないため、
 * 独自のシンプルな翻訳ヘルパーを提供。
 */
export function createEmailTranslator(locale: EmailLocale = 'en') {
  const msg = messages[locale] ?? messages.en;

  return function t(key: string, params?: Record<string, string | number>): string {
    // "welcome.subject" → msg.welcome.subject
    const keys = key.split('.');
    let value: unknown = msg;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key; // fallback to key
      }
    }
    if (typeof value !== 'string') return key;

    // Replace {param} placeholders
    if (params) {
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        value,
      );
    }
    return value;
  };
}

export type EmailTranslator = ReturnType<typeof createEmailTranslator>;
export type { EmailLocale };
