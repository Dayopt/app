const LOCALE_PREFIX_PATTERN = /^\/(en|ja)(?=\/|$)/;
const SETTINGS_RETURN_FALLBACK_PATH = '/day';

/**
 * PC で設定を閉じてワークスペースへ戻る時の遷移先。
 *
 * `/` にしてはいけない。`[locale]/page.tsx` は `(app)` route group の外にあり
 * `/{locale}/week` へサーバー redirect するため、`/` を経由すると `(app)/layout.tsx`
 * 配下の `GlobalOverlays`（`Toaster` の mount 元）が一度 unmount される。
 * 直前に積んだ toast は描画前に失われる。最終到達先は同じなので直接指す。
 */
export const DESKTOP_SETTINGS_EXIT_PATH = '/week';

export function normalizeSettingsReturnPath(returnTo: string | null | undefined): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return SETTINGS_RETURN_FALLBACK_PATH;
  }

  const pathWithoutLocale = returnTo.replace(LOCALE_PREFIX_PATTERN, '') || '/';
  if (pathWithoutLocale === '/settings' || pathWithoutLocale.startsWith('/settings/')) {
    return SETTINGS_RETURN_FALLBACK_PATH;
  }

  return pathWithoutLocale;
}

export function buildSettingsReturnQuery(returnPath: string): string {
  return `?returnTo=${encodeURIComponent(returnPath)}`;
}
