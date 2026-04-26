# Cleanup Plan 2026-04-26

監査範囲: `src/` 配下
監査者: auto mode (Claude Code, Opus 4.7)
カテゴリ: dead-code / cast-residue / lint-warn / feature-sliced / storybook-gap / jsdoc-drift

参照プラン: `~/.claude/plans/auto-mode-plan-auto-mode-push-elegant-lecun.md`

## サマリ

| category       | total  | exec:true | exec:false |
| -------------- | ------ | --------- | ---------- |
| dead-code      | 30     | 22        | 8          |
| cast-residue   | 8      | 0         | 8          |
| lint-warn      | 1      | 0         | 1          |
| feature-sliced | 1      | 0         | 1          |
| storybook-gap  | 16     | 16        | 0          |
| jsdoc-drift    | 1      | 0         | 1          |
| **合計**       | **57** | **38**    | **19**     |

## 監査ベースライン（Phase 開始時の状態）

- `npm run typecheck`: pass
- `npm run lint`: warning 0 / error 0
- `npm run lint:boundaries`: pass
- `npm run lint:i18n`: pass
- `knip`: unused files 4 / unused exports 645（src/ 内）
- `as` cast 残置: 195 件（test 除外後）
- `: unknown` / `as unknown`: 129 件（多くは `Record<string, unknown>` / `error: unknown` の正当用途）
- `: any`: 0 件（良好）
- 公開 component（feature barrel から re-export）で story 無し: 16 件

---

## 項目

### dead-code（C-001 〜 C-030）

#### unused files

- id: C-001
  category: dead-code
  rationale: knip 検出、`grep "anthropic-client" src/` で参照 0 件 verify 済み（feature/ai は未起動 module）
  target: src/features/ai/lib/anthropic-client.ts
  change: ファイル削除
  risk: low
  est_loc: -120
  depends_on: []
  exec: true

- id: C-002
  category: dead-code
  rationale: knip 検出、`grep "from.*ai/types" src/` で参照 0 件
  target: src/features/ai/types.ts
  change: ファイル削除
  risk: low
  est_loc: -40
  depends_on: []
  exec: true

- id: C-003
  category: dead-code
  rationale: knip 検出、`grep "from '@/features/contact'" src/` で参照 0 件（contact feature は server/router 経由で使用）
  target: src/features/contact/index.ts
  change: ファイル削除
  risk: low
  est_loc: -10
  depends_on: []
  exec: true

- id: C-004
  category: dead-code
  rationale: knip 検出。実体 verify 必要。`src/lib/i18n/request.ts` は next-intl の `getRequestConfig` を default export している可能性あり、削除前に再 grep
  target: src/lib/i18n/request.ts
  change: 参照 0 件確認後にファイル削除、参照あれば skip
  risk: med
  est_loc: -50
  depends_on: []
  exec: true

#### barrel re-export 削減（feature barrel index.ts から未使用 re-export を除去）

- id: C-005
  category: dead-code
  rationale: barrel `src/lib/date/index.ts` から 63 関数が re-export されているが利用 0。実体 file は他 file 内で参照されており削除不可、barrel 経由参照のみ削除
  target: src/lib/date/index.ts
  change: 未使用 re-export を削除（addHours/addMonths/addWeeks/getMonthDates 等 63 件）。各 export を `grep "{name}" src/` で 0 件 verify
  risk: med
  est_loc: -80
  depends_on: []
  exec: true

- id: C-006
  category: dead-code
  rationale: barrel `src/features/calendar/components/views/shared/index.ts` から 44 件未使用
  target: src/features/calendar/components/views/shared/index.ts
  change: 未使用 re-export 削除
  risk: med
  est_loc: -60
  depends_on: []
  exec: true

- id: C-007
  category: dead-code
  rationale: barrel `src/features/calendar/interaction/index.ts` から 35 件未使用
  target: src/features/calendar/interaction/index.ts
  change: 未使用 re-export 削除
  risk: med
  est_loc: -50
  depends_on: []
  exec: true

- id: C-008
  category: dead-code
  rationale: barrel `src/features/entry/index.ts` から 20 件未使用
  target: src/features/entry/index.ts
  change: 未使用 re-export 削除
  risk: med
  est_loc: -30
  depends_on: []
  exec: true

- id: C-009
  category: dead-code
  rationale: barrel `src/features/tags/index.ts` から 10 件未使用（IconPicker / useDeleteGroup 他）
  target: src/features/tags/index.ts
  change: 未使用 re-export 削除
  risk: med
  est_loc: -15
  depends_on: []
  exec: true

- id: C-010
  category: dead-code
  rationale: barrel `src/lib/sentry/index.ts` から 9 件未使用
  target: src/lib/sentry/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -12
  depends_on: []
  exec: true

- id: C-011
  category: dead-code
  rationale: barrel `src/features/tags/hooks/index.ts` から 9 件未使用
  target: src/features/tags/hooks/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -12
  depends_on: []
  exec: true

- id: C-012
  category: dead-code
  rationale: barrel `src/features/auth/index.ts` から 7 件未使用（selectError 等の selector）
  target: src/features/auth/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -10
  depends_on: []
  exec: true

- id: C-013
  category: dead-code
  rationale: barrel `src/features/stats/index.ts` から 7 件未使用
  target: src/features/stats/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -10
  depends_on: []
  exec: true

- id: C-014
  category: dead-code
  rationale: barrel `src/features/chronotype/index.ts` から 6 件未使用
  target: src/features/chronotype/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -10
  depends_on: []
  exec: true

- id: C-015
  category: dead-code
  rationale: barrel `src/features/tour/index.ts` から 5 件未使用（TourOrchestrator 等）
  target: src/features/tour/index.ts
  change: 未使用 re-export 削除。TourOrchestrator の story 追加（C-046）と同時実装される場合は public API として残す判断もあるため、Phase 2 で再 grep verify
  risk: med
  est_loc: -8
  depends_on: []
  exec: true

- id: C-016
  category: dead-code
  rationale: barrel `src/features/calendar/components/views/shared/components/index.ts` から 4 件未使用
  target: src/features/calendar/components/views/shared/components/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -6
  depends_on: []
  exec: true

- id: C-017
  category: dead-code
  rationale: barrel `src/lib/components/shell/sidebar/index.ts` から 4 件未使用
  target: src/lib/components/shell/sidebar/index.ts
  change: 未使用 re-export 削除
  risk: low
  est_loc: -6
  depends_on: []
  exec: true

- id: C-018
  category: dead-code
  rationale: 小規模 barrel の未使用 re-export を一括削除（合計 6 ファイル × 1-3 件）
  target: src/features/entry/components/inspector/fields/index.ts, src/features/entry/components/card/index.ts, src/features/entry/hooks/index.ts, src/features/onboarding/index.ts, src/features/settings/index.ts, src/lib/i18n/index.ts
  change: 各 barrel から未使用 re-export を削除
  risk: low
  est_loc: -15
  depends_on: []
  exec: true

#### 実体ファイル内の未使用 export（verify 後に exec）

- id: C-019
  category: dead-code
  rationale: `src/lib/date/constants.ts` の MS_PER_SECOND 等 18 定数。`src/lib/date/index.ts` 経由の re-export 削減（C-005）後に再 grep して 0 件のもののみ削除。barrel 経由で外部公開されている可能性あり
  target: src/lib/date/constants.ts
  change: 未使用定数を削除
  risk: med
  est_loc: -30
  depends_on: [C-005]
  exec: true

- id: C-020
  category: dead-code
  rationale: `src/features/calendar/components/views/shared/constants/grid.constants.ts` の 13 定数が未使用
  target: src/features/calendar/components/views/shared/constants/grid.constants.ts
  change: 未使用定数を削除
  risk: med
  est_loc: -25
  depends_on: [C-006]
  exec: true

- id: C-021
  category: dead-code
  rationale: `src/features/entry/server/service-index.ts` から 10 件未使用（EntryServiceError 等の型 export）。型は外部からも import されうるため `grep "EntryServiceError" src/` 必須
  target: src/features/entry/server/service-index.ts
  change: 0 件 verify できたものだけ削除
  risk: med
  est_loc: -15
  depends_on: []
  exec: true

- id: C-022
  category: dead-code
  rationale: `src/lib/test/trpc-test-helpers.ts` の 9 件未使用 helper（createMockEntry 等）。test 用 helper は将来再利用前提もあるが、現状 0 件参照
  target: src/lib/test/trpc-test-helpers.ts
  change: 未使用 helper を削除
  risk: low
  est_loc: -50
  depends_on: []
  exec: true

- id: C-023
  category: dead-code
  rationale: `src/lib/date/timezone.ts` の 8 関数（formatInTimezone 等）が未使用。barrel re-export 削減後に削除
  target: src/lib/date/timezone.ts
  change: 未使用関数を削除
  risk: med
  est_loc: -50
  depends_on: [C-005]
  exec: true

- id: C-024
  category: dead-code
  rationale: `src/lib/date/format.ts` の 7 関数（formatDateTime 等）が未使用
  target: src/lib/date/format.ts
  change: 未使用関数を削除
  risk: med
  est_loc: -40
  depends_on: [C-005]
  exec: true

- id: C-025
  category: dead-code
  rationale: `src/lib/trpc/procedures.ts` の 7 件未使用（adminProcedure / paginationSchema 等）。tRPC procedure factory なので削除前に二重 verify
  target: src/lib/trpc/procedures.ts
  change: 0 件確認したものだけ削除、TODO コメント付きは残す
  risk: med
  est_loc: -30
  depends_on: []
  exec: true

- id: C-026
  category: dead-code
  rationale: `src/features/entry/schemas/entry.ts` の 7 件未使用（entryOriginSchema 等）。Zod schema は `z.infer<>` で型として使われている可能性あり、verify 必須
  target: src/features/entry/schemas/entry.ts
  change: 0 件 verify できたものだけ削除
  risk: med
  est_loc: -20
  depends_on: []
  exec: true

- id: C-027
  category: dead-code
  rationale: `src/features/tags/hooks/useTagCrudMutations.ts` の 6 件未使用
  target: src/features/tags/hooks/useTagCrudMutations.ts
  change: 未使用 export を削除
  risk: low
  est_loc: -20
  depends_on: [C-011]
  exec: true

- id: C-028
  category: dead-code
  rationale: `src/lib/tanstack-query/cache-config.ts` の 5 件 cache strategy が未使用
  target: src/lib/tanstack-query/cache-config.ts
  change: 未使用 cache strategy 削除
  risk: low
  est_loc: -15
  depends_on: []
  exec: true

- id: C-029
  category: dead-code
  rationale: `src/lib/sentry/integration.ts` の 5 件未使用
  target: src/lib/sentry/integration.ts
  change: 未使用 export 削除
  risk: low
  est_loc: -20
  depends_on: [C-010]
  exec: true

- id: C-030
  category: dead-code
  rationale: shadcn/ui 系（sheet/select/drawer/dialog/alert-dialog/avatar/badge/input/button/skeleton 等）の未使用 export 30+ 件は将来利用前提のため**削除しない**
  target: src/lib/components/ui/\*.tsx
  change: 削除しない（shadcn/ui はコンポーネント完全形を維持）
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

### cast-residue（C-031 〜 C-038）

src/ 内 195 件（test 除外後）の `as` キャスト。多くは `import * as Sentry from '@sentry/nextjs'` 等の正当な name space import や Stripe API レスポンス型 narrow など runtime 保証が必要なケース。機械的に消せるものは少数のため、Phase 2 ではすべて exec:false（記録のみ）。

- id: C-031
  category: cast-residue
  rationale: `src/features/entry/server/tag-statistics.ts` で 12 件の `as` cast、Supabase クエリ結果の型 narrow が中心。型の正規化要設計判断
  target: src/features/entry/server/tag-statistics.ts
  change: cast を型ガード関数に置換する設計検討（記録のみ、Phase 2 では実行しない）
  risk: med
  est_loc: 0
  depends_on: []
  exec: false

- id: C-032
  category: cast-residue
  rationale: `src/lib/tanstack-query/persist-storage.ts` で 7 件、IndexedDB API の型 narrow（仕様上必要）
  target: src/lib/tanstack-query/persist-storage.ts
  change: 削除不可（記録のみ）
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-033
  category: cast-residue
  rationale: `src/features/entry/stores/createFilterStore.ts` で 7 件、generic store factory の variance 回避
  target: src/features/entry/stores/createFilterStore.ts
  change: 削除不可（記録のみ）
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-034
  category: cast-residue
  rationale: `src/features/auth/stores/useAuthStore.ts` で 6 件
  target: src/features/auth/stores/useAuthStore.ts
  change: 記録のみ
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-035
  category: cast-residue
  rationale: `src/app/api/webhooks/stripe/route.ts` で 6 件、Stripe webhook event payload narrow（仕様上必要）
  target: src/app/api/webhooks/stripe/route.ts
  change: 削除不可（記録のみ）
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-036
  category: cast-residue
  rationale: `src/lib/pwa/sync-queue.ts` で 5 件、IndexedDB cursor result narrow
  target: src/lib/pwa/sync-queue.ts
  change: 記録のみ
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-037
  category: cast-residue
  rationale: `src/features/settings/server/router.ts` / `billing-service.ts` で計 10 件、Supabase / Stripe API narrow
  target: src/features/settings/server/router.ts, src/features/settings/server/billing-service.ts
  change: 記録のみ
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

- id: C-038
  category: cast-residue
  rationale: その他 src/ 内 cast 約 140 件は外部 API / Supabase / DOM event の narrow が中心。機械的削減対象ではない
  target: src/ 全体（残余）
  change: 記録のみ
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

### lint-warn（C-039）

- id: C-039
  category: lint-warn
  rationale: `npm run lint --max-warnings 9999` で warning 0 件、error 0 件確認済み
  target: なし
  change: 対応不要（記録のみ）
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

### feature-sliced（C-040）

- id: C-040
  category: feature-sliced
  rationale: `src/lib/components/shell/sidebar/Sidebar.tsx` が `@/features/auth` の `useAuthStore` を直接 import。`lib/ → features/` の依存方向違反（CLAUDE.md「依存方向: `features/ → lib/` の一方向」）。修正には Sidebar が auth state を props 経由で受け取る設計変更が必要 = 機能変更を伴うため exec:false
  target: src/lib/components/shell/sidebar/Sidebar.tsx
  change: 設計検討（記録のみ）。修正は別 plan で「Sidebar を auth state 受け取り型に refactor」として起票
  risk: high
  est_loc: 0
  depends_on: []
  exec: false

### storybook-gap（C-041 〜 C-056）

公開 component（barrel から re-export されているもの）で story が無いもの 16 件。各 entry は `Default` + `AllPatterns` story 追加。

- id: C-041
  category: storybook-gap
  rationale: TourOrchestrator は public component だが story 無し
  target: src/features/tour/components/TourOrchestrator.tsx
  change: TourOrchestrator.stories.tsx 作成（Default + AllPatterns）
  risk: low
  est_loc: +60
  depends_on: []
  exec: true

- id: C-042
  category: storybook-gap
  rationale: ContactDialog は public component
  target: src/features/contact/components/ContactDialog.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +60
  depends_on: []
  exec: true

- id: C-043
  category: storybook-gap
  rationale: TagQuickSelector は public component
  target: src/features/tags/components/TagQuickSelector.tsx
  change: stories.tsx 作成。tags mock 必要、storybook skill のテンプレートに従う
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-044
  category: storybook-gap
  rationale: BadgeSection は stats public component
  target: src/features/stats/components/badges/BadgeSection.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +60
  depends_on: []
  exec: true

- id: C-045
  category: storybook-gap
  rationale: InsightsView は stats public component
  target: src/features/stats/components/insights/InsightsView.tsx
  change: stories.tsx 作成。tRPC mock 必要
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-046
  category: storybook-gap
  rationale: ProgressView は stats public component
  target: src/features/stats/components/progress/ProgressView.tsx
  change: stories.tsx 作成
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-047
  category: storybook-gap
  rationale: StatsView は stats public root component
  target: src/features/stats/components/StatsView.tsx
  change: stories.tsx 作成
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-048
  category: storybook-gap
  rationale: TagDetailPage は stats public component
  target: src/features/stats/components/tag-detail/TagDetailPage.tsx
  change: stories.tsx 作成
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-049
  category: storybook-gap
  rationale: SettingsContent は settings public root
  target: src/features/settings/components/SettingsContent.tsx
  change: stories.tsx 作成
  risk: med
  est_loc: +80
  depends_on: []
  exec: true

- id: C-050
  category: storybook-gap
  rationale: TimeSelect は entry inspector の public field
  target: src/features/entry/components/inspector/fields/TimeSelect.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +60
  depends_on: []
  exec: true

- id: C-051
  category: storybook-gap
  rationale: ViewSwitcherList は calendar layout public
  target: src/features/calendar/components/layout/Header/ViewSwitcherList.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +60
  depends_on: []
  exec: true

- id: C-052
  category: storybook-gap
  rationale: CalendarController は public root component。ただしルート composition なので mock 量が多い
  target: src/features/calendar/components/CalendarController.tsx
  change: stories.tsx 作成（最小 Default のみ可）
  risk: med
  est_loc: +100
  depends_on: []
  exec: true

- id: C-053
  category: storybook-gap
  rationale: CalendarNavigationContext は context provider、story は wrapper component で表現
  target: src/features/calendar/hooks/navigation/CalendarNavigationContext.tsx
  change: stories.tsx 作成
  risk: med
  est_loc: +60
  depends_on: []
  exec: true

- id: C-054
  category: storybook-gap
  rationale: SessionMonitorProvider は auth public、provider 系
  target: src/features/auth/components/SessionMonitorProvider.tsx
  change: stories.tsx 作成（debug visualization のみ）
  risk: med
  est_loc: +60
  depends_on: []
  exec: true

- id: C-055
  category: storybook-gap
  rationale: AuthStoreInitializer は initializer component、UI なしのため story では effect 確認 stub
  target: src/features/auth/stores/AuthStoreInitializer.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +40
  depends_on: []
  exec: true

- id: C-056
  category: storybook-gap
  rationale: UserSettingsInitializer は settings initializer、UI なし
  target: src/features/settings/components/UserSettingsInitializer.tsx
  change: stories.tsx 作成
  risk: low
  est_loc: +40
  depends_on: []
  exec: true

### jsdoc-drift（C-057）

- id: C-057
  category: jsdoc-drift
  rationale: src/ 内 70 ファイルに JSDoc `@param`/`@returns` 計 338 行。機械的 drift 検出は 1 file ずつ Read+比較が必要で、auto mode 1 commit/file でも 70 commit を要する。Phase 1 サンプルでは drift 確定が見つからず、効率より品質優先のため別 plan に分離（plan の停止条件「Phase 2 で 50 commit 超」を防ぐため除外）
  target: src/ 全体（70 file）
  change: 別 plan で個別実施
  risk: low
  est_loc: 0
  depends_on: []
  exec: false

---

## 実行ログ（Phase 2 で追記）

<!-- Phase 2 実行時に以下のフォーマットで追記:
- 2026-04-26 14:00 C-001 完了 (commit: abc1234, est=-120 actual=-118)
- 2026-04-26 14:05 C-004 skip 理由: 参照あり (i18n request handler は next-intl が動的 import)
-->

### 2026-04-26 Phase 2 開始時 skip ログ

- **C-001 skip**: `src/features/ai/lib/anthropic-client.ts` は AI feature scaffolding として意図的配置。`.storybook/docs/product/projects/ai-feature-scaffolding/summary.md` で「factory pattern wrapper を先行配置、後続 project watching-ai-implementation の前段」と明記。削除すると後続 project の前提が壊れる。**Phase 2 では削除しない**
- **C-002 skip**: `src/features/ai/types.ts` のファイル先頭に `// Type definitions for ai feature. Intentionally empty — populated in watching-ai-implementation.` と明記。意図的に空のまま残す scaffolding。**削除しない**
- **C-003 skip**: `src/features/contact/index.ts` は barrel として `ContactDialog` 等を export しているが、実利用は `src/app/.../GlobalOverlays.tsx` で `import('@/features/contact/components/ContactDialog')` 形式の deep dynamic import。barrel が「未使用」なのは正しいが、CLAUDE.md feature-boundaries.md は barrel 経由 import を規約とするため、**正しい修正は GlobalOverlays.tsx を barrel 経由に直すこと**（plan の change「barrel 削除」と方向性が逆）。plan 外の変更が必要のため skip
- **C-004 skip**: `src/lib/i18n/request.ts` は `next.config.mjs` の `createNextIntlPlugin('./src/lib/i18n/request.ts')` から動的読み込み。knip は next.config を解析しない false positive。削除すると i18n の getRequestConfig が消えて build 破綻

### 停止判定

連続 4 entry で skip 発生。stop条件「連続 2 項目で skip 発生」を超えたため Phase 2 を停止。

knip 由来の C-001〜C-004 はすべて「knip false positive または scaffolding 意図」であり、Phase 1 監査時点で `.knipignore` 設定と next.config 解析の前提を確認すべきだった。今後の対応案:

1. `.knipignore` を整備して `src/features/ai/**` / `src/lib/i18n/request.ts` を除外
2. C-005 以降の barrel re-export 削減は false positive リスクが C-001〜C-004 より低い（実体ファイルではなく re-export 行のみ削除）。next run で C-005 から再開する案を検討
3. C-003 の「barrel 経由 import 規約」違反は別 plan で feature-sliced refactor として起票（C-040 と同系統）

次 run の起動条件:

- `.knipignore` 整備、または C-001〜C-004 を plan から外す合意
- C-005 の barrel re-export 削減から再開（risk: med、grep 再 verify 必須）

### 2026-04-26 Phase 2 続行ログ（C-005 再開以降）

barrel re-export 削減 14 件を完了:

- C-005 完了: `src/lib/date/index.ts`、約 60 件の未使用 re-export 削除（commit 5d569944c）
- C-006 完了: `src/features/calendar/components/views/shared/index.ts`、44 件削除（commit 44ea3e0cf）
- C-007 完了: `src/features/calendar/interaction/index.ts`、35 件削除（commit deb5432a5）
- C-008 完了: `src/features/entry/index.ts`、18 件削除（layout.ts が NO_OVERLAY/ActualTimeDiffOverlay を barrel 経由で参照していたため当該 2 件は保持、commit 2dcd9f8ee）
- C-009 完了: `src/features/tags/index.ts`、10 件削除（commit bc1b5dec7）
- C-010 完了: `src/lib/sentry/index.ts`、9 件削除（commit db4fc124f）
- C-011 完了: `src/features/tags/hooks/index.ts`、9 件削除（commit 97dea9e1e）
- C-012 完了: `src/features/auth/index.ts`、7 件削除（commit ed0d1b759）
- C-013 完了: `src/features/stats/index.ts`、7 件削除（commit c273ababf）
- C-014 完了: `src/features/chronotype/index.ts`、6 件削除（commit c99dee5ca）
- C-015 完了: `src/features/tour/index.ts`、5 件削除（commit c3d9c8cc6）
- C-016 完了: `src/features/calendar/components/views/shared/components/index.ts`、4 件削除（commit 5d6610ad9）
- C-017 完了: `src/lib/components/shell/sidebar/index.ts`、4 件削除（commit 12016ebfb）
- C-018 完了: 小規模 barrel 6 件一括（entry/inspector/fields, entry/card, entry/hooks, onboarding, settings, lib/i18n、commit 0caa36bec）

storybook-gap 1 件を完了:

- C-041 完了: `TourOrchestrator.stories.tsx` 新規作成（minimal Default + AllPatterns、commit fa395fdc3）

#### Phase 2 再停止: storybook-gap 残り 15 件と実体 unused exports（C-019〜C-029）

**理由**: storybook-gap の残り 15 件（C-042〜C-056）はほぼすべて tRPC mutation / Zustand store / next-intl provider に依存しており、Storybook で動かすには `.storybook/mocks/` の trpcMocks / storeMocks 設計判断が必要。`auto mode 推奨ケース（仕様確定 + 機械的展開）` の枠を超え「`mock 戦略の design decision`」が混入する。同じく実体 unused exports（C-019〜C-029）は外部参照 / 型 import の二重 verify が必要で、机上の grep だけでは false positive リスクが残る。

**plan §2.4 該当条件**: 「design decision が必要な状況（plan 上 exec:true でも実装中に判明した場合）」。

#### 次 run の起動条件・続行案

1. **storybook-gap 続行**: `.storybook/mocks/stores.tsx` / `.storybook/decorators/` の既存 mock pattern を確認し、各 component に必要な mock を整理。storybook skill の Feature Component テンプレート展開で `parameters.storeMocks` / `parameters.trpcMocks` を共通指定できるか検討
2. **実体 unused exports 続行**: 各 entry の export ごとに `grep -rn "{name}" src/ .storybook/ scripts/ messages/` で実 import を全件検証してから削除（C-005 と同水準の whitelist 方式）
3. **storybook-gap の skip 提案**: 描画なし initializer (AuthStoreInitializer / UserSettingsInitializer) は story を作っても Canvas に有意な UI が表示されないため、「公開 component に story 必須」というルール側を緩める方が筋

#### 成果サマリ

- 完了 entry: 15 件（barrel cleanup 14 件 + story 1 件）
- 削減 LOC: 約 -340 行（barrel から re-export 行を除去）
- 検証: 各 commit で `npm run typecheck` を pass（`.storybook/main.ts` 由来の baseline error は私の変更とは無関係のため除外）
- push: なし（main へ直接 commit のみ）
