'use client';

import { WifiOff } from 'lucide-react';

const messages = {
  en: {
    title: "You're offline",
    description: 'No internet connection. Check your connection and try again.',
    reload: 'Reload',
  },
  ja: {
    title: 'オフライン',
    description: 'インターネット未接続。接続を確認してもう一度試して',
    reload: '再読み込み',
  },
} as const;

function getLocaleMessages() {
  if (typeof navigator === 'undefined') return messages.en;
  return navigator.language.startsWith('ja') ? messages.ja : messages.en;
}

/**
 * オフラインフォールバックページ
 *
 * Service Workerがオフライン時に表示
 * [locale]ルート外のためnext-intl使用不可 → navigator.languageで言語判定
 */
export default function OfflinePage() {
  const t = getLocaleMessages();

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <div className="bg-muted mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full">
          <WifiOff className="text-muted-foreground h-10 w-10" />
        </div>
        <h1 className="text-foreground mb-2 text-2xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground mb-6 max-w-sm">{t.description}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center justify-center rounded-2xl px-6 py-4 font-normal transition-colors"
        >
          {t.reload}
        </button>
      </div>
    </div>
  );
}
