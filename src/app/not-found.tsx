/**
 * ルートレベル Not Found ページ
 *
 * Route Group外で404エラーが発生した場合に表示。
 * NextIntlClientProviderが利用できないため、静的英語テキストを使用。
 * global-error.tsx に揃えたカード型デザイン。
 */
'use client';

import { Button } from '@/components/ui/button';

export default function RootNotFound() {
  return (
    <div className="bg-background fixed inset-0 flex items-center justify-center overflow-auto p-4">
      <div className="bg-card border-border-subtle w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-foreground mb-2 text-2xl font-medium">Page not found</h1>
          <p className="text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        <Button onClick={() => (window.location.href = '/')} className="w-full">
          Go to Home
        </Button>
      </div>
    </div>
  );
}
