'use client';

import { useTranslations } from 'next-intl';

import { isSupabasePreviewDegraded } from '@/lib/supabase/client';

/**
 * Preview で Supabase env が未設定（placeholder のまま）の時だけ表示する固定バナー。
 *
 * #2416（Shared Preview Supabase）が凍結中のため、一般 Preview スコープには
 * Supabase env が存在しない。以前は createClient() の SupabaseConfigError throw により
 * 認証・データ系機能が起動時に落ちていたが、`isSupabasePreviewDegraded()` が
 * true の間はそれらが「無効」であることを明示するだけに留める（fail-open にはしない
 * — 認証チェック自体はこのバナーの有無に関わらず変わらない）。
 *
 * #2416 が凍結解除され実 env が入れば isSupabasePreviewDegraded() は自動的に false になり、
 * このバナーも自動的に非表示へ戻る（撤去不要）。
 */
export function SupabasePreviewDegradedBanner() {
  const t = useTranslations();

  if (!isSupabasePreviewDegraded()) {
    return null;
  }

  return (
    <div
      className="border-border-subtle bg-card shadow-card fixed inset-x-0 top-0 z-50 border-b p-3 text-center"
      role="status"
    >
      <p className="text-foreground text-sm font-medium">
        {t('common.supabasePreviewDisabled.banner.title')}
      </p>
      <p className="text-muted-foreground text-xs">
        {t('common.supabasePreviewDisabled.banner.description')}
      </p>
    </div>
  );
}
