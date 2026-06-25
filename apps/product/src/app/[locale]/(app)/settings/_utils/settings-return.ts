const LOCALE_PREFIX_PATTERN = /^\/(en|ja)(?=\/|$)/;

export const SETTINGS_RETURN_FALLBACK_PATH = '/calendar/day';

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
