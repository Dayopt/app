import 'server-only';

/**
 * Phase 1 で metadata に declare する scope。
 * 実装は read:entries のみ。read:tags / read:stats は Phase 2 で tool 追加時に有効化。
 */
export const SUPPORTED_SCOPES = ['read:entries', 'read:tags', 'read:stats'] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export const DEFAULT_SCOPES: SupportedScope[] = ['read:entries'];

export function parseRequestedScope(scopeParam: string | null | undefined): SupportedScope[] {
  if (!scopeParam) return DEFAULT_SCOPES;
  const requested = scopeParam.split(/\s+/).filter(Boolean);
  const valid = requested.filter((s): s is SupportedScope =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  return valid.length > 0 ? valid : DEFAULT_SCOPES;
}
