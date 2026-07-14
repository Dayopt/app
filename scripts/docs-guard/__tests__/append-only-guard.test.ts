import { describe, expect, it } from 'vitest';

import { isSupersedeOnlyDiff } from '../checks/append-only-guard.ts';

describe('isSupersedeOnlyDiff', () => {
  it('正常系: superseded_byの追記を許可する', () => {
    expect(
      isSupersedeOnlyDiff(`diff --git a/log.md b/log.md
--- a/log.md
+++ b/log.md
@@ -2,0 +3 @@
+superseded_by: docs/product/log/2026-08-01-new.md
`),
    ).toBe(true);
  });

  it('legacy status: supersededの追記を許可する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -1,0 +2 @@
+status: superseded
`),
    ).toBe(true);
  });

  it('エラー系: 本文追記を拒否する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -10,0 +11 @@
+追記した本文
`),
    ).toBe(false);
  });

  it('エラー系: 既存行の削除を拒否する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -2 +2 @@
-status: current
+status: superseded
`),
    ).toBe(false);
  });
});
