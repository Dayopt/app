import { describe, expect, it } from 'vitest';

import { SUPPORTED_SCOPES, hasWriteScope, isSupportedScope } from './scopes';

// #2271 scope追加（PR #2267 クロスレビュー、behavior-verifier指摘の移送）。
// `isWriteScope`/`hasWriteScope` は prefix 構造判定ではなく `WRITE_SCOPES` 配列への
// enum 判定になっているため、SUPPORTED_SCOPES に write:/delete: prefix の scope を
// 追加しても WRITE_SCOPES へ足し忘れれば型エラーにならず applyDurableWriteGate を
// 静かにすり抜ける。`WRITE_SCOPES` を直接 import せず、公開 API である hasWriteScope
// 経由で「SUPPORTED_SCOPES 中の write:/delete: prefix 全量が write scope として
// 検出されるか」を assert することで、新規 scope 追加時にもこの test が自動で対象に
// 含まれる（ハードコードした scope 名の列挙に依存しない）。
describe('WRITE_SCOPES 網羅性 invariant', () => {
  const writePrefixedScopes = SUPPORTED_SCOPES.filter(
    (scope) => scope.startsWith('write:') || scope.startsWith('delete:'),
  );
  const readOnlyScopes = SUPPORTED_SCOPES.filter(
    (scope) => !scope.startsWith('write:') && !scope.startsWith('delete:'),
  );

  it('前提: SUPPORTED_SCOPES に write:/delete: prefix の scope が存在する', () => {
    expect(writePrefixedScopes.length).toBeGreaterThan(0);
  });

  it.each(writePrefixedScopes)('%s は hasWriteScope から write scope として検出される', (scope) => {
    expect(isSupportedScope(scope)).toBe(true);
    expect(hasWriteScope([scope])).toBe(true);
  });

  it.each(readOnlyScopes)('%s は hasWriteScope から write scope として検出されない', (scope) => {
    expect(hasWriteScope([scope])).toBe(false);
  });
});
