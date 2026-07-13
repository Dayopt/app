---
agent: playwright_test_generator
description: 承認済み計画から単一のE2Eを生成する
---

承認済みテスト計画から、指定されたシナリオ1件だけをPlaywright testとして生成してください。

- Test plan: `specs/calendar-review-panel.md`
- Seed file: `apps/product/src/lib/test/e2e/seed.spec.ts`
- Output: `apps/product/src/lib/test/e2e/generated/` 配下の1ファイル
- Prefer: role / label / stable data attribute locator
- Forbidden: `waitForLoadState('networkidle')`, `.catch()`による失敗の握りつぶし、`test.skip()`、`test.fixme()`、固定wait
