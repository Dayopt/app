import 'server-only';

/** OAuth grants that Dayopt understands. Tool discovery is filtered separately. */
export const SUPPORTED_SCOPES = [
  'read:entries',
  'read:tags',
  'read:constraints',
  'read:stats',
  'write:plans',
  'delete:plans',
  'write:records',
  'delete:records',
] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

/** Public metadata advertises only the generally available minimum scope. */
export const ADVERTISED_SCOPES = ['read:entries'] as const satisfies readonly SupportedScope[];

const WRITE_SCOPES = [
  'write:plans',
  'delete:plans',
  'write:records',
  'delete:records',
] as const satisfies readonly SupportedScope[];

const DEFAULT_SCOPES: SupportedScope[] = ['read:entries'];

/**
 * 戻り値:
 *   - scope param 省略時: DEFAULT_SCOPES (OAuth spec 上 client がデフォルト想定で OK)
 * Explicit scope input is all-or-nothing. Silently dropping an unknown scope
 * would make the consent screen authorize a different grant than the client
 * requested.
 */
export function parseRequestedScope(
  scopeParam: string | null | undefined,
): SupportedScope[] | null {
  if (!scopeParam) return DEFAULT_SCOPES;
  const requested = scopeParam.split(/\s+/).filter(Boolean);
  if (requested.length === 0) return DEFAULT_SCOPES;
  if (!requested.every(isSupportedScope)) return null;
  return [...new Set(requested)];
}

export function isSupportedScope(scope: string): scope is SupportedScope {
  return (SUPPORTED_SCOPES as readonly string[]).includes(scope);
}

export function hasWriteScope(scopes: readonly SupportedScope[]): boolean {
  return scopes.some((scope) => (WRITE_SCOPES as readonly SupportedScope[]).includes(scope));
}
