import 'server-only';

/**
 * Phase 1 で metadata に declare する scope。
 * 実装は read:entries のみ。read:tags / read:stats は Phase 2 で tool 追加時に有効化。
 */
export const SUPPORTED_SCOPES = ['read:entries', 'read:tags', 'read:stats'] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export const DEFAULT_SCOPES: SupportedScope[] = ['read:entries'];

/**
 * 戻り値:
 *   - scope param 省略時: DEFAULT_SCOPES (OAuth spec 上 client がデフォルト想定で OK)
 *   - 明示的に valid scope を含む: 解釈可能な scope だけを返す
 *   - 明示的に渡されたが全部 unsupported: `null` (caller は invalid_scope エラーで拒否)
 */
export function parseRequestedScope(
  scopeParam: string | null | undefined,
): SupportedScope[] | null {
  if (!scopeParam) return DEFAULT_SCOPES;
  const requested = scopeParam.split(/\s+/).filter(Boolean);
  if (requested.length === 0) return DEFAULT_SCOPES;
  const valid = requested.filter((s): s is SupportedScope =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  return valid.length > 0 ? valid : null;
}
