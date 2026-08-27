/**
 * ルートレベル Not Found ページ
 *
 * Route Group外で404エラーが発生した場合に表示。
 * NextIntlClientProviderが利用できないため、静的英語テキストを使用。
 * global-error.tsx に揃えたカード型デザイン。
 */
'use client';

import { Button, Card } from '@dayopt/components';

export default function RootNotFound() {
  return (
    <div className="bg-background fixed inset-0 flex items-center justify-center overflow-auto p-4">
      <Card className="border-border-subtle bg-card w-full max-w-md gap-0 rounded-2xl p-8 py-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-foreground mb-2 text-2xl font-medium">Page not found</h1>
          <p className="text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- not-found からの復旧は状態を完全にリセットするためハードリロードが意図的 */}
        <Button onClick={() => (window.location.href = '/')} className="w-full">
          Go to Home
        </Button>
      </Card>
    </div>
  );
}
