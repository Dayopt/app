---
agent: playwright_test_planner
description: Calendar Review panel のE2E計画を作成する
---

Calendarのweek viewでReview panelを開閉・復元する代表フローについて、既存E2Eと重複しない最小のテスト計画を作成してください。

- Seed file: `apps/product/src/lib/test/e2e/seed.spec.ts`
- Existing tests: `apps/product/src/lib/test/e2e/review-granularity.spec.ts`, `apps/product/src/lib/test/e2e/deep-link.spec.ts`
- Test plan: `specs/calendar-review-panel.md`
- Scope: 正常系1件と、URL state復元の境界ケース1件まで
- Do not: AccountやCalendar全体への網羅拡張、既存テストの置き換え
