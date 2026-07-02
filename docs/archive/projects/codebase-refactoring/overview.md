---
status: done
---

# codebase-refactoring: 段階的完全リファクタリング全体設計

> **策定日**: 2026-06-12
> **ステータス**: Phase 0 進行中 — Q1-Q7 回答済み / I-01 完了（[knip-audit.md](./knip-audit.md)）/ I-02 完了（[tag-detail-liveness.md](./tag-detail-liveness.md)）/ 残: I-03（characterization tests）
> **スコープ**: デッドコード削除 / barrel 契約整理 / service 層統一 / server state 一本化 / DB 整理 / テスト・CI 強化。UI 変更・仕様変更は含まない
> **レビュー**: /plan-review（fact-checker + critic）通過済み（v2 で REVISE 反映、v3 でゼロベース設計評価反映）

> v2: `/plan-review`（fact-checker + critic）の REVISE 判定を反映。①削除単位をファイル単位 → **export 単位** ②drop migration 手順を「procedure 削除 deploy → Sentry 静穏確認 → drop」に書き換え ③knip blocking 化を Phase 7 → **Phase 1 直後**に前倒し ④characterization test の対象を **UserSettingsInitializer の gate semantics** に差し替え ⑤invalidate 統一を store 移行で触るファイルに限定 ⑥RLS テストを全 user-owned テーブルの parameterized suite に拡大 ⑦fact 誤り 6 件修正。
>
> v3: ゼロベース設計評価を反映。⑧**「新規ロジックは TS service 層、既存 PL/pgSQL 52 関数は凍結資産」方針**を追加 ⑨packages 統合（10 → 2-3 個）を要確認 Q7 として追加 ⑩Q4（offline-sync）を「同期エンジンを買うか機能を切るか」の製品判断に格上げ ⑪データモデルの小確認 2 件（duration_minutes 不変条件 / Json 列）を Phase 0 に追加。

## Context

長年の開発で蓄積した不要コード・古い仕様の名残・重複実装・責務の曖昧な構造を段階的に解消し、開発速度・保守性・仕様理解・AI 開発支援の精度を上げる。本計画は 2026-06-12 時点の main (956532fe) に対する read-only 調査（Explore agent 3並列 + 手動検証 + fact-check agent 照合）に基づく。**この計画自体ではコード変更を行わない**。成果物は「そのまま GitHub Issues に分解できる粒度のタスク群」。

### ゼロベース設計評価（要約）

「今ゼロから作るならこの設計にするか」の評価結果。**rewrite に値する欠陥はない**:

- **維持する（ゼロベースでも同じ選択）**: entries の plan/actual 同居モデル、tag_id 単一 FK、テーブル 10 個の小ささ、tRPC（end-to-end 型は AI 開発と最良の相性）、feature DAG の依存方向、Supabase RLS、date-fns 単一
- **ゼロベースなら変える → 漸進的に寄せる**:
  1. **ロジックの重心が DB に沈んでいる**（テーブル 10 個に対し PL/pgSQL 関数 52 個）。型安全・ユニットテスト・knip の網の外で、migration churn（pre_drop/post_drop の踊り、44 個の drop/remove）の根本原因。→ **大移植はせず「新規は TS service 層、既存 52 関数は凍結資産（bug fix のみ）」を rules 化**
  2. **packages/ 10 個は過剰**（2 個は空、大半は型のみ）。→ 空 package 削除は Phase 1、統合（10 → 2-3）は Q7 の判断後に低優先で
  3. **PWA offline-sync の中途半端な自前実装が最大の設計リスク**。→ Q4 を「同期エンジンを買う（Replicache/ElectricSQL 系）か、機能を切るか」の製品判断に格上げ。中間状態の維持が最悪の選択肢
- **AI 開発前提の教訓**: 劣化したのは正確に「散文ルールはあるが機械強制のない場所」だけ（knip non-blocking → 219 件蓄積、ファイルサイズ lint なし → 977/1,020 行、docs 完了状態の強制なし → summary 欠落）。原則: 規約は CI で強制 / ロジックは型システムの中に置く / ファイルと procedure は 1 セッションのコンテキストに収まる粒度 / 生成できるものは手書きしない

### 調査で確定した重要事実（fact-check 済み）

| 事実                                                                                                                                                                                                                 | 根拠                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| knip は CI で `--no-exit-code` 実行され**決して fail しない**                                                                                                                                                        | `apps/product/package.json:38` `quality:deadcode:ci`                                 |
| knip 報告: unused files 12 / unused exports 219 / unused types 249 / unused deps 8+15                                                                                                                                | `pnpm quality:deadcode` 実行結果                                                     |
| `src/lib/i18n/request.ts` の unused 判定は**誤検出**（`next.config.mjs:11` から文字列参照）                                                                                                                          | `createNextIntlPlugin('./src/lib/i18n/request.ts')`                                  |
| `@dayopt/*` workspace packages の unused dependency 判定も誤検出の疑い                                                                                                                                               | knip workspace 設定不足                                                              |
| review/components/tag-detail/ のチャート系 6 コンポーネントは **PR #1290（Review 全面再設計）で孤児化**。外部からの import 参照ゼロ（hit はコメント・部分文字列のみ）                                                | `TagDetailPage.tsx` の local import は `:21 TagDetailTitle` のみ                     |
| `useTagDetailData.ts` は 4 hooks を export。**dead は 3 つ**（useTagOverviewData / useTagTimelineData / useTagRecentEntries = 孤児のみが消費）、**`useTagDashboardData` は live**（TagDetailPage.tsx:15,257 が使用） | fact-check で確認。削除は hook 単位                                                  |
| `tag-statistics.ts` も live（`getTagDashboard`、RPC 非依存）と dead（RPC 呼び出し procedure 群）が同居                                                                                                               | 削除は procedure 単位                                                                |
| `packages/utils/src/index.ts` は `export {}` のみ、`packages/server/src/index.ts` は `import "server-only"; export {};` のみ。`@dayopt/utils` / `@dayopt/server` への参照は apps/ 配下 0 件                          | 実ファイル確認 + grep                                                                |
| **DB はテーブル 10 個 / PL/pgSQL 関数 52 個**（ロジック重心が DB 側）                                                                                                                                                | `packages/database/src/generated/database.types.ts`                                  |
| feature 境界違反は 0 件（DAG モデルは機能している）                                                                                                                                                                  | `pnpm lint:boundaries` 実行結果                                                      |
| migration: active 115 / `_archive` 116。RLS 操作 147 statement が migration 全体に分散                                                                                                                               | `supabase/migrations/`                                                               |
| settings router は service 未分離: 直接 supabase 操作 7 箇所（**`.from()` 5 + `.rpc()` 2**。:75,:184,:200,:210,:253,:290,:303）                                                                                      | `features/settings/server/router.ts`                                                 |
| entry router の supabase.rpc 直呼びは 1 箇所（**:295** `bulk_soft_delete_entries`）                                                                                                                                  | `features/entry/server/router.ts:295`                                                |
| server state を保持する Zustand store が 3 件                                                                                                                                                                        | `useUserPreferenceStore` / `useCalendarSettingsStore` / `useChronotypeSettingsStore` |
| `lib/toast.ts:47,:50` の @deprecated 対象は **`toast.info` / `toast.warning` メソッド**（Inline Banner に移行予定）                                                                                                  | 実ファイル確認                                                                       |
| `scripts/parse-filename.ts` は **使用中**（`scripts/eagle-sync.ts:46` が import）。削除候補から除外                                                                                                                  | fact-check で判明                                                                    |
| invalidate 系呼び出しは grep で **約 70 箇所**（当初の 226 は過大。Phase 0 で再計測）                                                                                                                                | fact-check で再計測                                                                  |

### 規模

- 全体: 1,274 ファイル / 約 167,000 LOC（apps/product が 999 ファイル / 138,652 LOC）
- features: calendar 213 / entry 118 / review 100 / settings 52 / tags 46 / auth 28 / chronotype 20 / contact 13 ファイル
- DB: テーブル 10 / PL/pgSQL 関数 52 / active migration 115
- テスト 483 件、Storybook stories 172 件、i18n 14 namespace 約 1,400 キー/言語
- CI: 3-stage 8 jobs + quality-gate（typecheck/lint/boundaries/i18n/license/build/bundle/e2e は blocking、**knip のみ non-blocking**）

---

## Plan Format 準拠（plan-format.md）

### Goal（1文）

デッドコード・責務曖昧な構造・server state の二重管理を段階的に除去し、CI で再発を恒久的に防止できる状態にする。

### Minimum Viable Approach

骨格は 3 つだけ:

1. **knip を信頼できる状態にする**（誤検出の除去）→ それを根拠に export 単位でデッドコードを削除 → **直後に knip を CI blocking 化**（再発防止。churn の大きい Phase 2-4 を保護下で走らせる）
2. **server state の Zustand 二重管理 3 store を TanStack Query に一本化**（UserSettingsInitializer の gate semantics を characterization test で先に固定）
3. **service 未分離の router 2 件（settings / auth recovery）を既存の EntryService パターンに揃える**

それ以外（巨大ファイル分割、barrel 整理、テスト拡充、docs 整備、migration 整理、SQL 凍結方針の rules 化）は上記を阻害しない独立タスクとして追加。理由: 開発速度・AI 精度への寄与が大きく、各々独立に着手・中断できるため。

### Reversibility Table（フェーズ単位）

| Phase                              | タグ        | 備考                                                                                                                                      |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0（調査・棚卸し）            | `[minutes]` | docs と knip 設定変更のみ                                                                                                                 |
| Phase 1（削除 + knip blocking 化） | `[minutes]` | git revert で即復元可。削除は liveness 表の根拠確認後のみ                                                                                 |
| Phase 2（構成・命名）              | `[minutes]` | 純 code 変更                                                                                                                              |
| Phase 3（ロジック分離）            | `[minutes]` | 純 code 変更。挙動同一を test で担保                                                                                                      |
| Phase 4（状態管理）                | `[minutes]` | 純 code 変更だが挙動リスクあり → characterization test 必須                                                                               |
| Phase 5（DB/migration）            | `[hours]`   | drop migration は新規 migration のみ。関数は状態を持たず `CREATE OR REPLACE FUNCTION` 再適用で数分復元可。**squash は今回やらない（Q3）** |
| Phase 6（test/docs）               | `[minutes]` | 追加のみ                                                                                                                                  |
| Phase 7（最終クリーンアップ）      | `[minutes]` | 設定変更。revert 可                                                                                                                       |

`[irreversible]` を含む step は**なし**（baseline migration の書き換え・URL 変更・schema 公開変更・外部 URL 面 `/api/v1/calendar/[token]` への変更は全て「やらない」に分類）。

### Existing Code to Reuse

- `apps/product/src/features/entry/server/entry-service.ts` — service 層分離の参照実装（settings/auth の service 抽出テンプレート）
- `apps/product/src/features/entry/hooks/useEntryMutations.ts` — optimistic update（onMutate/onError/onSettled）の参照実装（settings mutation に適用）
- `UserSettingsInitializer.tsx` — gate semantics の不変条件が明記済み。characterization test の対象
- `scripts/check-feature-boundaries.ts` / `check-i18n-integrity.ts` — CI ゲートスクリプトの既存パターン
- `api:spec:check` の drift 検出方式 — RLS snapshot の「スクリプト生成 + CI drift check」の同型テンプレート
- `apps/product/knip.json` — 既存 knip 設定（entry/ignore の拡張のみ。新ツール導入不要）
- `apps/product/src/lib/test/` の integration fixtures — RLS integration テスト拡充の土台
- `.github/workflows/integration.yml` — integration テストの path-trigger 既存設計

### What I'm Not Doing

- **UI 変更・コピー変更** — ユーザー指示により原則含めない（リファクタのみ）
- **仕様変更** — 機能の追加・削除・挙動変更は全 issue で out of scope。挙動が変わったら bug
- **PL/pgSQL 52 関数の TS への大移植** — 移植は新たな regression リスクを生む。「新規ロジックは TS service 層、既存 SQL 関数は凍結資産（修正は bug fix のみ）」の方針で漸進的に重心を移す（Phase 5 / Phase 7 で rules 化）
- **baseline migration（00000000000000_baseline.sql）の書き換え / migration squash の実行** — 本番適用済みで rollback コスト大。今回は判断資料の作成まで（Q3）
- **lib/oauth-server のリファクタ** — OAuth 2.1 の外部契約 + security-sensitive。auto mode 禁止領域。触らない
- **billing enforcement フラグの整理** — Phase B（launch 前）設計済みの意図的フラグ。古い仕様ではない
- **lib/date と time-utils の責務統合** — 責務分離（Date オブジェクト系 vs HH:MM 文字列系）は健全。※ただし `date-utils.ts` という**薄いラッパーの `lib/date/` への吸収は Phase 2 でやる**（命名規約違反の解消であり責務統合ではない）
- **feature 境界（DAG）の再設計** — 違反 0 件で機能している。触る理由がない
- **invalidate 規約の全域 sweep 統一** — 「ついでに refactor」になるため Phase 4 では store 移行で触るファイル内に限定
- **offline-sync の自前実装続行の既成事実化** — Q4 で「同期エンジンを買う / 機能を切る」を先に決める。決まるまで offline 関連コードは触らない
- **「念のため」の新 abstraction 導入** — YAGNI。分割は既存パターンへの追従のみ

---

## 1. 現状診断

### Critical（構造的にデッドコードが増え続ける原因 / AI 精度への影響最大）

| ID  | 対象                                                                                                                                                                                                                                                                                     | 理由                                                                                                                                                                         | 影響                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| C1  | `apps/product/package.json:38`（`quality:deadcode:ci` の `--no-exit-code`）                                                                                                                                                                                                              | knip が CI で走るのに**絶対に fail しない**。デッドコード 219 exports / 12 files はこの設定の帰結                                                                            | 削除しても再発する。再発防止の要                                                      |
| C2  | `features/review/components/tag-detail/` のチャート系 6 ファイル（TagDetailHero / TagDowChart / TagHourlyChart / TagFulfillmentDistribution / TagRecentBlocks / TagAccuracyTrendChart）+ `useTagDetailData.ts` の dead hooks 3 つ + `tag-statistics.ts` の dead procedures + 下流 DB RPC | PR #1290 の Review 再設計で参照が切れた孤児。**ただし同一ファイル内に live コード（`useTagDashboardData` / `getTagDashboard`）が同居**するため削除は export / procedure 単位 | 死んだ実装が「現行仕様」として AI のコンテキストを汚染。review feature の理解コスト増 |

### High（開発速度・保守性への影響が大きい）

| ID  | 対象                                                                                                                                                           | 理由                                                                                                                                                                                                                                        | 影響                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1  | `lib/stores/useUserPreferenceStore.ts` / `features/calendar/stores/useCalendarSettingsStore.ts` / `features/chronotype/stores/useChronotypeSettingsStore.ts`   | DB 由来の server state を Zustand で二重管理。invalidate 経路がなく stale リスク。特に「dbSettings 確定前に timezone 依存 mutation が defaults で走ると誤ったタイムスタンプが server に書き込まれる」data integrity 境界が store 実装に依存 | 設定変更後の表示不整合、データフロー追跡の難化                              |
| H2  | `features/settings/server/router.ts`（直接 supabase 操作 7 箇所 = from 5 + rpc 2）/ `features/auth/server/router.ts`（recovery code ロジック 250+ LOC 直書き） | tRPC 3 層パターン（router → service → DB）違反。entry/tags は分離済みで不統一                                                                                                                                                               | 同型の処理が 2 流儀で存在し、AI/人間とも誤ったパターンを学習する            |
| H3  | 巨大ファイル: `tag-service.ts` (1,020行) / `useEntryMutations.ts` (977行) / `entry-service.ts` (857行) / `entry/server/statistics.ts` (848行)                  | 複数責務の同居。diff レビュー・部分理解が困難                                                                                                                                                                                               | 変更コスト増・コンフリクト多発点                                            |
| H4  | unused exports 219 / unused types 249（feature barrel の出しすぎ）                                                                                             | barrel の public API 契約が曖昧。`entry/index.ts` の domain 二重 re-export、`tags/index.ts` と `lib/tag-colors.ts` の定数二重 export                                                                                                        | 「何が公開 API か」が読めない。knip blocking 化の障害                       |
| H5  | `packages/utils`・`packages/server`（実体 export なし、参照ゼロ。fact-check 済み）                                                                             | 空 package が monorepo 構造のノイズ                                                                                                                                                                                                         | 新規参加者/AI が「ここに書くべきか」と誤認                                  |
| H6  | `apps/product/knip.json` の誤検出（`i18n/request.ts`、`@dayopt/*` deps、indirect devDeps 15 件）                                                               | 検出器自体が信頼できない状態                                                                                                                                                                                                                | 「knip の警告は無視してよい」という文化を生む。C1 と相互強化                |
| H7  | **ロジック重心の DB 沈降**: テーブル 10 個に対し PL/pgSQL 関数 52 個（stats/集計/バッチ）                                                                      | 型安全・ユニットテスト・knip の網の外。migration churn（pre_drop/post_drop、timezone fix 連鎖）の根本原因                                                                                                                                   | **大移植はしない**。「新規は TS / 既存は凍結」の方針で漸進対応（Phase 5/7） |

### Medium（計画的に解消すべき）

| ID  | 対象                                                                                                                                                                                                   | 理由 / 影響                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| M1  | integration テスト 4 件のみ（`integration.yml`）                                                                                                                                                       | RLS は migration 147 statement に分散しており回帰検知が弱い                  |
| M2  | テスト分布の不均衡（calendar 40 / entry 34 に対し auth 4 / chronotype 4 / contact 4。server service テスト 12/21 ファイル）                                                                            | auth は security-sensitive なのに薄い                                        |
| M3  | `supabase/migrations/` active 115 件 + RLS 分散                                                                                                                                                        | 「現在有効な schema/policy」の把握に全 migration の読解が必要                |
| M4  | `lib/toast.ts:47,:50` の **`toast.info` / `toast.warning`** が @deprecated（Inline Banner 移行予定）のまま停滞                                                                                         | deprecated API の利用が続く。**要確認 Q2**                                   |
| M5  | `features/settings/components/` の直接 supabase 呼び出し。`supabase.auth.updateUser()` / `signOut()` は**正当**（Auth SDK はクライアント操作が標準）。tRPC 化対象は `profiles.update` 直接更新のみ     | cache invalidation が手動で stale リスク                                     |
| M6  | ~~invalidate / setData の流儀混在~~ → **再計測で解消（I-01）**: `queryClient.invalidateQueries` 直呼び 0 件、`utils.x.invalidate()` 71 件に統一済み。setData 系 72 件は optimistic update の正当な使用 | Phase 4 タスク 4 は**規約の docs 化のみ**に縮小（knip-audit.md 参照）        |
| M7  | `lib/test/e2e/pwa/offline-sync.spec.ts` の TODO 42 件 = **自前同期エンジンの中途半端な実装**（ゼロベース評価で最大の設計リスク）                                                                       | **Q4 決定（2026-06-12）: 機能を切る** → I-23 で削除（installability は残す） |
| M8  | 進行中 project docs 3 件（cleanup-2026-04-26 / review-granularity-redesign / mcp-server）に summary.md なし                                                                                            | 完了/進行中の判別不能                                                        |

### Low（ついでに直さない。独立した小タスクとして処理）

| ID  | 対象                                                                               | 備考                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | eslint-disable 43 件                                                               | 大半は正当化済み。Phase 7 で棚卸し                                                                                                                                                                                                  |
| L2  | `lib/date-utils.ts`（再エクスポート + parseDateString のみ。命名規約違反でもある） | Phase 2 で `lib/date/` へ吸収                                                                                                                                                                                                       |
| L3  | 各 feature `domain/index.ts` barrel の未参照                                       | barrel 整理（Phase 2）に内包                                                                                                                                                                                                        |
| L4  | 未使用疑い script                                                                  | ~~parse-filename.ts~~ は **eagle-sync.ts:46 から使用中と判明し除外**。I-01 の棚卸しで真の未使用が出た場合のみ対応                                                                                                                   |
| L5  | `@typescript-eslint/no-unused-vars` off                                            | TS compiler 依存で実害小。Phase 7 で再評価                                                                                                                                                                                          |
| L6  | `packages/domain/src/index.ts` の barrel 未整備（直接 path import 1 件）           | 利用が最小。**要確認 Q6**（現状維持推奨）                                                                                                                                                                                           |
| L7  | `entries.duration_minutes` が `start/end_time` と並存（導出可能値の実体化）        | 不変条件がどこで守られているか Phase 0 で確認のみ（変更しない）。**既存 issue #1285（`planned_duration_minutes` への rename）が別途存在** — schema 変更を含むため本リファクタの範囲外。I-03 の確認結果は #1285 の判断材料として共有 |
| L8  | `user_settings.chronotype_settings` / `personalization` が型のない Json 列         | Zod 検証の有無を Phase 0 で確認。列昇格は別 plan（schema 変更のため本計画外）                                                                                                                                                       |

### 健全と確認できた領域（触らない根拠）

- **データモデル**: entries の plan/actual 同居 + tag_id 単一 FK + テーブル 10 個 — ゼロベースでも同じ設計にする
- **feature 境界（DAG モデル）**: 違反 0。ESLint + `check-feature-boundaries.ts` で強制済み
- **date/time utilities の責務分離**: `lib/date/`（core/format/timezone/timeString）と `time-utils.ts`（HH:MM 文字列）は明確
- **依存ライブラリ**: date-fns 単一、重複ライブラリなし、全て最新系
- **i18n**: 14 namespace、`lint:i18n` で en/ja 整合を CI 強制済み
- **CI 全体**: knip 以外は包括的に blocking
- **lib/ の構造**: oauth-server / pwa / auth / trpc 等、feature 非依存の原則は守られている

---

## 2. 全体方針

### 優先順位の原則

1. **「検出器の信頼回復 → export 単位の削除 → 即 blocking 化」を最優先**（C1/H6 → C2/H4/H5 → knip blocking）。削除は移動・改名より先。**blocking 化は Phase 1 完了直後**に行い、churn の大きい Phase 2-4 を保護下で走らせる
2. **統合（責務整理）は削除の後**。デッドコードを含んだまま分割すると死んだ責務まで新構造に移植してしまう
3. **再設計は最小**。feature 境界・lib 構造・データモデルは健全なので、再設計対象は「barrel 契約」「server state の置き場」の 2 点 + 「ロジックの置き場の方針」（新規 TS / 既存 SQL 凍結）のみ

### 最初に着手すべき領域

`knip.json` の修正（H6）。理由: 以降の全削除作業の根拠となる検出器を先に信頼できる状態にしないと、「削除は根拠確認後」の原則が運用できない。

### 触るべきでない領域

- `lib/oauth-server/`（外部契約 + security-sensitive）
- `lib/billing/enforcement.ts` と `proProcedure` の素通し設計（launch 前の意図的フラグ）
- `00000000000000_baseline.sql` および本番適用済み migration の書き換え
- 既存 PL/pgSQL 52 関数の中身（凍結資産。修正は bug fix のみ。drop は I-15 の孤児 RPC のみ）
- `/api/v1/calendar/[token]`（外部公開 URL 面）
- UI コンポーネントの見た目・コピー（copywriting.md の領域）
- `supabase/functions/send-auth-email`（稼働中の auth フロー）
- offline-sync 関連コード（Q4 の製品判断が出るまで）

### 仕様変更とリファクタリングを混ぜないための方針

- **全 issue に「挙動変更なし」を acceptance criteria として明記**。挙動が変わる場合はリファクタではなくバグとして扱う
- 削除対象は **4 層 liveness 表（component / hook export / procedure / DB RPC）で参照ゼロが確定したもののみ**。削除単位はファイルではなく **export / procedure 単位**
- 製品判断が絡むもの（tag-detail、toast deprecated、offline-sync、packages 統合）は**要確認リストで承認を得てから**着手
- 挙動が不明瞭な領域（3 store、settings update）は **characterization test を先に作ってから**移行
- 1 issue = 1 PR。path-limited add + `git diff --cached` ゲート（workflow.md 準拠）

### 要確認リスト（2026-06-12 全件回答済み）

| #   | 項目                                                                                                                      | **決定（2026-06-12）**                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | tag-detail チャート 6 件 + dead chain: #1290 直後の孤児。削除してよいか、将来の再配線予定か                               | **削除する**（liveness 表で dead 確定した export 単位で削除）                                                                   |
| Q2  | `toast.info` / `toast.warning`（@deprecated）: Inline Banner 移行を完遂するか、deprecated 解除か                          | **現状維持**（推奨デフォルト採用。移行は UI 変更を伴うため本計画外、別計画で判断）                                              |
| Q3  | migration squash（baseline 再生成）: 今回は見送り推奨                                                                     | **見送り**（I-16 で判断資料のみ作成し将来再検討）                                                                               |
| Q4  | **【製品判断】PWA offline-sync**: 自前同期エンジンの中途半端な実装をどうするか                                            | **機能を切る**（関連コード・spec を削除し docs に経緯を記録 → **新規 issue I-23**。PWA の installability は別物として境界確認） |
| Q5  | `@tanstack/react-virtual` / `@tailwindcss/typography` 等の依存削除可否                                                    | **I-01 の再調査結果に従う**（推奨デフォルト採用。使用ゼロ確定分のみ削除）                                                       |
| Q6  | `packages/domain` barrel: export 整備 or 現状維持                                                                         | **現状維持**（推奨デフォルト採用）                                                                                              |
| Q7  | **packages 統合**: 10 packages → 2-3 個（database + design tokens 程度）への統合。空 package 削除（I-05）とは別の構造判断 | **統合する（低優先）**（Phase 2 末尾の I-22 として実施）                                                                        |

#### Q4 決定に伴う追加 issue

**I-23: offline-sync 機能の削除（製品判断済みの仕様変更を含む）**

- goal: 自前同期エンジン（offline-sync）を削除し、保守コストと「中途半端な実装」リスクを解消する
- scope: `lib/pwa/` の offline-sync 実装、`lib/test/e2e/pwa/offline-sync.spec.ts`（TODO 42 件）、`offline-sync.test.ts`（1,278 行）、関連 UI 文言・i18n キー
- out of scope: **PWA の installability（manifest / install prompt）** — offline-sync とは別機能のため残す（境界は着手時に確認）、Service Worker のキャッシュ戦略のうち静的アセット配信に必要な部分
- tasks: ① offline-sync と installability の境界を特定 ② sync エンジン・キュー・関連 hook の削除 ③ spec / テスト削除 ④ i18n キー削除（`pnpm lint:i18n`）⑤ 削除の経緯（Q4 判断・再導入条件 = 同期エンジン購入の別 plan）を docs に記録
- acceptance criteria: offline-sync コードゼロ、PWA インストールは引き続き動作、CI green
- verification: `pnpm test:run && pnpm build && pnpm lint:i18n && pnpm test:e2e:smoke`
- 位置づけ: Phase 1 の Track A に追加（I-05 と並行可）。**唯一「仕様変更を含む」issue**（製品判断 Q4 で承認済み）

---

## 3. フェーズ別計画

> 共通の完了ゲート（全フェーズ）: `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries` pass、1 issue = 1 PR、`git diff --cached` 確認、挙動変更なし。

### Phase 0: 調査・棚卸し（検出器の信頼回復と安全網の敷設）

- **目的**: 以降の削除・移行の「根拠」と「安全網」を作る。コード本体は変更しない
- **対象範囲**: `apps/product/knip.json`、調査ドキュメント（`apps/storybook/docs/product/projects/codebase-refactoring/`）、characterization tests
- **作業内容**:
  1. knip 誤検出の解消: `src/lib/i18n/request.ts` を entry に追加、`@dayopt/*` workspace 解決、indirect devDeps（commitlint/husky/prettier-plugin 等 15 件）を理由コメント付きで `ignoreDependencies` へ。修正後に unused 全件レポートを再生成し「削除候補 / 公開 API 化 / 要確認」に 3 分類
  2. **tag-detail の 4 層 liveness 表**作成: component（6 件）/ hook export（useTagDetailData.ts の 4 hooks 各々）/ tRPC procedure（tag-statistics.ts の各 procedure）/ DB RPC（`get_tag_*` 系）の各ノードに参照元と参照数を記録。live と dead の境界を export 単位で確定（削除はしない）。各 RPC の定義元 migration（rollback 用）も記録。Q1 の承認資料とする
  3. characterization tests 作成（store の state 遷移ではなく、移行後も生き残る**公開挙動**を対象に）: (a) `UserSettingsInitializer` の gate semantics（dbSettings confirmed まで children 非 render / error / offline-paused の各分岐）(b) 3 store の consumer hook の公開挙動 (c) hydration 前に timezone 依存 mutation が発火しないこと（誤タイムスタンプ書き込み防止の data integrity 境界）
  4. invalidate 箇所の正確な再計測（約 70 と推定）と、統一対象（store 移行で触るファイル）の特定
  5. データモデル小確認（確認のみ・変更しない）: (a) `entries.duration_minutes` と `start/end_time` の整合性不変条件がどこで守られているか (b) `user_settings` の Json 列 2 つに Zod ランタイム検証があるか
  6. 本計画を project 設計書として `codebase-refactoring/overview.md` に保存（workflow.md の大規模判定に準拠）
- **完了条件**: knip 再実行で誤検出ゼロ、liveness 表が docs に存在、characterization tests が CI green、Q1-Q7 の回答取得
- **リスク**: knip 設定変更で見落とし → 修正前後の JSON レポート diff を残す
- **検証方法**: `pnpm quality:deadcode` の前後比較、`pnpm test:run`

### Phase 1: 未使用コード・古い仕様の削除 + knip blocking 化

- **目的**: 参照ゼロ確定済みのコードを export 単位で削除し、**直後に knip を CI blocking 化**して再蓄積を止める
- **対象範囲**: tag-detail dead chain（コード側のみ。DB RPC は Phase 5）、`packages/utils`、`packages/server`、unused exports 219 / types 249、`quality:deadcode:ci`
- **作業内容**:
  1. （Q1 承認後）liveness 表に基づき削除: コンポーネント 6 件（ファイル削除可）、dead hooks 3 つ（**hook 単位**。useTagDashboardData は残す）、dead procedures（**procedure 単位**。getTagDashboard は残す）、関連テスト・stories・i18n キー。**この時点で DB RPC は drop しない**（procedure 削除を production に deploy → Sentry 静穏確認が Phase 5 の前提）
  2. `packages/utils` / `packages/server` を workspace から削除（pnpm-workspace / turbo.json / 依存 package.json / lockfile）
  3. unused exports の削減を feature 単位で分割実行（entry+tags → calendar → lib+その他）。「export を外して内部化」が基本、ファイルごと不要なら削除。正当な「未参照だが公開したい export」は knip の `@public` タグで明示
  4. **knip blocking 化**: `quality:deadcode:ci` から `--no-exit-code` を除去（1 PR で即 blocking。観察期間は設けない — knip は決定的ツールで solo dev に観察期間の情報価値はない）。わざと unused export を作る PR で fail を実証 → revert
- **完了条件**: knip unused files 0 件 / unused exports が `@public` タグ付きのみ、knip が CI で blocking かつ green、全テスト green
- **リスク**: 動的参照の見落とし → Phase 0 の検出器修正で軽減。削除 PR ごとに `pnpm build` まで通す
- **検証方法**: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`、`pnpm quality:deadcode`、検証用 PR の CI fail 確認

### Phase 2: ディレクトリ構成・命名・責務の整理

- **目的**: feature barrel の public API 契約を明確化し、「どこから import すべきか」を一意にする
- **対象範囲**: 各 feature の `index.ts` / `domain/index.ts`、`lib/date-utils.ts`、（Q7 承認時のみ）packages 統合
- **作業内容**:
  1. barrel 契約の規約化: 「feature barrel に出すのは Composition Layer が使うものだけ。domain/index.ts は feature 内部用」を docs に明文化し、entry の二重 re-export・tags の定数二重 export を解消
  2. `lib/date-utils.ts` を `lib/date/` へ吸収（薄いラッパーの解消 + `utils.ts` 系命名規約違反の解消。責務統合ではない）
  3. （Q7 承認時のみ・低優先）packages 統合: 型のみの薄い packages（domain / billing / types / config 等）を 2-3 個に統合 or apps/product/src へ取り込み。apps/web と本当に共有するもの（database 生成型 + design tokens）だけ packages に残す
  4. ディレクトリ移動は最小限（feature 構造自体は健全なため大規模な再配置はしない）
- **完了条件**: 全 feature barrel が「外部から実際に使われる export のみ」になる。lint:boundaries green 維持
- **リスク**: import path の一括変更でコンフリクト → 他フェーズの PR と同時に進めない（このフェーズだけ直列）
- **検証方法**: `pnpm typecheck && pnpm lint:boundaries && pnpm test:run`、（packages 統合時）`pnpm install && pnpm build` 全 workspace

### Phase 3: ドメインロジックと UI ロジックの分離（service 層の統一）

- **目的**: tRPC 3 層パターン（router → service → DB）を全 feature で統一し、巨大ファイルを責務単位に分割する
- **対象範囲**: `features/settings/server/`、`features/auth/server/`、`features/entry/server/router.ts:295`、`features/entry/hooks/useEntryMutations.ts`、巨大 service 3 件
- **作業内容**:
  1. settings: `settings-service.ts` を新設し、router 内の直接 supabase 操作 7 箇所（from 5 + rpc 2）を移管（EntryService の構造を踏襲。ロジックは**書き換えずに移動**）
  2. auth: recovery code ロジック（250+ LOC）を service へ抽出。**security skill の観点でレビュー必須・auto mode 禁止**
  3. entry router の rpc 直呼び 1 箇所（:295 `bulk_soft_delete_entries`）を service へ
  4. `useEntryMutations.ts`（977 行）を mutation 単位のファイルに分割（公開 hook の signature 不変）
  5. `tag-service.ts` / `entry-service.ts` / `statistics.ts` の分割は「ファイル内の責務境界が明確な場合のみ」実施（無理な分割はしない。しない判断は理由を PR に記載）
- **完了条件**: 全 router から `ctx.supabase` 直呼びゼロ、分割後も公開 API の型 signature 不変、既存テスト green
- **リスク**: auth まわりの挙動変化 → 移動のみ（ロジック書き換え禁止）+ auth テスト補強（I-18）を先行 or 同時に
- **検証方法**: `pnpm test:run && pnpm test:integration`

### Phase 4: 状態管理・データ取得・mutation 周りの整理

- **目的**: server state の管理を TanStack Query に一本化し、Zustand を UI state 専用に戻す
- **対象範囲**: H1 の 3 store、settings mutations。**invalidate の全域統一はやらない**
- **作業内容**:
  1. `useUserPreferenceStore` → tRPC query（`userSettings.get`）+ invalidate へ移行。store は削除 or UI state のみ残す。**UserSettingsInitializer の gate semantics（characterization test）を移行後も green に保つ**
  2. `useCalendarSettingsStore` / `useChronotypeSettingsStore` も同様に移行（1 store = 1 PR）
  3. settings mutations に optimistic update（onMutate/onError/onSettled）を実装（useEntryMutations のパターン踏襲、optimistic-update skill 準拠）
  4. invalidate 流儀の統一は**このフェーズで触るファイル内のみ**（`utils.x.invalidate()` を標準とする基準は docs 化）
  5. settings コンポーネントの `profiles.update` 直呼びを tRPC mutation 化（`supabase.auth.updateUser` / `signOut` は正当なので**現状維持**）
- **完了条件**: server state を保持する Zustand store ゼロ、characterization tests（gate semantics / timezone 境界含む）が移行後も green
- **リスク**: 初期化タイミング・SSR hydration の挙動差 → characterization test (c)（hydration 前の timezone 依存 mutation 不発火）が回帰を検知
- **検証方法**: characterization tests、`pnpm test:e2e:smoke`、設定変更 → リロード → 反映の手動シナリオ

### Phase 5: DB / Supabase / RLS / migration 周りの整理

- **目的**: 「現在有効な schema / RLS」を migration を全部読まずに把握できる状態にし、孤児 RPC を安全に drop する。**破壊的操作は最小・手順厳格**
- **対象範囲**: 孤児 RPC の drop migration（新規）、RLS snapshot スクリプト + CI drift check、`_archive/` README、advisors、**ロジック置き場方針の確立**
- **作業内容**:
  1. **孤児 RPC の drop（手順固定）**: (1) Phase 1 の procedure 削除コードが production に deploy 済みであること (2) Sentry で該当 RPC 起因のエラーがゼロであることを確認（Supabase ログは保持期間が短く根拠にしない。根拠は**コード grep + Sentry 静穏**）(3) drop migration（新規 SQL）を作成し production 適用 (4) rollback 手順（liveness 表に記録した定義元 migration の `CREATE OR REPLACE FUNCTION` 再適用、所要数分）を migration PR の説明に必須記載。**注**: 単一 production project 運用のため PR Preview は DB 分離の安全網にならない — preview 検証を安全根拠にしない
  2. **ロジック置き場方針の確立**: 「新規の集計・ビジネスロジックは TS service 層に書く。既存 PL/pgSQL 52 関数は凍結資産（修正は bug fix のみ、機能追加は TS 側）。RPC の新設は RLS で表現できない原子的バッチ操作に限る」を方針として確定（rules への追記は Phase 7 / I-20）
  3. **RLS snapshot の自動化**: `api:spec:check` と同型の「スクリプト 1 コマンドで pg_policies / table 一覧を docs 生成 + CI drift check」を一度だけ作る（手動運用の snapshot docs は作らない — 陳腐化資産になるため）
  4. `_archive/`（116 件）に README を置き「歴史的記録、復元しない」と明記
  5. `mcp__supabase__get_advisors`（production read-only）で security/performance advisor を確認し、対応を issue 化
  6. squash は Q3 の判断資料（手順・リスク・所要時間）作成まで
- **完了条件**: drop migration が手順 (1)-(4) を満たして適用済み、RLS snapshot が CI で drift 検出可能、advisors の指摘が全件 issue 化 or 対応不要の理由付き記録
- **リスク**: drop した RPC を呼ぶ残存コード → 手順 (1)(2) で遮断。migration 適用とコード deploy の非アトミック性 → コード側削除を必ず先行
- **検証方法**: `pnpm db:fresh` でローカル再構築 green、`pnpm test:integration`、production 適用後の Sentry 監視

### Phase 6: Storybook / docs / test の再整備

- **目的**: リファクタの安全網を将来に渡って維持できる水準にする
- **対象範囲**: integration tests、auth/chronotype/contact のユニットテスト、project docs
- **作業内容**:
  1. **RLS integration テストの parameterized suite 化**: 全 user-owned テーブル（profiles / entries / tags / user_settings / user_badges / mfa_recovery_codes / reports / api_keys）の「他ユーザー行の select/update/delete 拒否」+ service-role 専用テーブル（stripe_webhook_events / email_suppressions）への client アクセス全拒否を 1 suite で網羅（parameterize すれば限界コストほぼゼロ）
  2. auth service（Phase 3 抽出後）のユニットテスト追加。chronotype / contact は主要ロジックのみ
  3. 進行中 project docs 3 件の summary.md 作成（cleanup-2026-04-26 / review-granularity-redesign / mcp-server）
  4. 本リファクタ project の docs を随時更新（workflow.md 準拠）
  5. （Q4 の判断に従い）offline-sync spec の TODO 42 件を「導入設計を別 plan へ / 凍結（skip 化 + docs 明記）」のどちらかに倒す
- **完了条件**: RLS suite が全対象テーブルをカバー、auth server コードのテスト確保、summary.md 3 件
- **リスク**: テストが実装詳細に結合しすぎる → 公開 API（procedure / hook の入出力）に対するテストに限定
- **検証方法**: `pnpm test:run && pnpm test:integration`、CI green

### Phase 7: 最終クリーンアップ・再発防止

- **目的**: パターン逸脱が「入った瞬間に CI で落ちる」状態を完成させ、project を閉じる（knip blocking は Phase 1 で完了済み）
- **対象範囲**: eslint 設定、`.claude/rules/`、project summary
- **作業内容**:
  1. eslint-disable 43 件の棚卸し（「必要 / 不要 / 代替可」に分類して不要分を除去）、`@typescript-eslint/no-unused-vars` の on 化を費用対効果込みで判断
  2. 再発防止ルールの明文化: **barrel 契約 / server state 禁止（Zustand）/ service 層必須 / 新規ロジックは TS・既存 SQL 凍結** を `.claude/rules/` 該当ファイルに追記（CLAUDE.md は概要のみ維持、skill-design.md の rules/skill 境界に従う）
  3. （任意・費用対効果が合えば）ファイル行数の警告 lint（例: 600 行超で warn）を検討 — 巨大ファイル再発の機械的検知。合わなければ見送り理由を記録
  4. リファクタ project の summary.md 作成（before/after metrics: LOC 削減、unused 件数推移、残課題、squash 等見送り事項の再検討条件）
- **完了条件**: `pnpm lint` green、rules 追記が既存 rules / skills と非重複、summary.md が workflow.md の完了形式準拠
- **リスク**: rules の重複・肥大化 → skill-design.md の境界原則に従う
- **検証方法**: `pnpm lint && pnpm lint:boundaries`、docs レビュー

---

## 4. GitHub Issue 化できるタスク案

> 全 issue 共通: **out of scope に「挙動変更・UI 変更・仕様変更」を含む** / acceptance criteria に「`pnpm typecheck && pnpm lint && pnpm lint:boundaries` pass」を含む。以下では固有部分のみ記載。ラベル案: `refactoring`, `phase-N`, `needs-decision`（要確認系）。

### Phase 0

**I-01: knip 設定の誤検出解消とデッドコード棚卸しレポート**

- goal: knip の報告を「全件が真の未使用」と信頼できる状態にする
- scope: `apps/product/knip.json`、棚卸しレポート（docs）
- out of scope: コード削除、CI 設定変更
- tasks: ① `src/lib/i18n/request.ts` を entry 追加 ② `@dayopt/*` workspace 解決設定 ③ indirect devDeps 15 件を理由コメント付きで ignoreDependencies へ ④ 修正前後の JSON レポートを docs に保存 ⑤ 残った unused を「削除候補 / 公開 API 化 / 要確認」に 3 分類 ⑥ invalidate 箇所の再計測
- acceptance criteria: 再実行で誤検出（i18n/request.ts / @dayopt/\*）が消える。分類表が docs に存在
- verification: `pnpm quality:deadcode`（JSON 出力の diff 確認）

**I-02: tag-detail dead chain の 4 層 liveness 表作成（削除はしない）**

- goal: #1290 で孤児化した実装の生死境界を **export 単位**で確定し、Q1 の承認資料を作る
- scope: `features/review/components/tag-detail/`、`hooks/useTagDetailData.ts`（4 hooks 各々）、`features/entry/server/tag-statistics.ts`（各 procedure）、`get_tag_*` 系 DB RPC
- out of scope: 削除・変更
- tasks: ① component / hook export / procedure / DB RPC の 4 層で各ノードの参照元と参照数を表化 ② live 確定（useTagDashboardData = TagDetailPage.tsx:15,257 / getTagDashboard ほか）と dead 確定を明示 ③ 各 RPC の定義元 migration を記録（rollback 用 `CREATE OR REPLACE FUNCTION` の所在）
- acceptance criteria: 表の各ノードに grep 再現可能な根拠あり。live/dead の境界が export 単位で一意
- verification: レポート内の各 grep コマンドが再現可能であること

**I-03: characterization tests（UserSettingsInitializer の gate semantics 固定）+ データモデル小確認**

- goal: Phase 4 の store 移行後も生き残る「公開挙動」をテストで固定する（store の state 遷移は対象外 — 既存テストがあり、store ごと消えるため）
- scope: `UserSettingsInitializer` と 3 store の consumer hook、データモデル確認メモ
- out of scope: 実装変更、store の移行、schema 変更
- tasks: ① gate semantics: dbSettings confirmed まで children 非 render / error / offline-paused の各分岐 ② consumer hook の公開挙動（読み出し値の契約）③ hydration 前に timezone 依存 mutation が発火しないこと ④ duration_minutes の整合性不変条件の所在確認（メモのみ）⑤ user_settings Json 列の Zod 検証有無確認（メモのみ）
- acceptance criteria: 新規テストが現実装で green。「現挙動が正か」の判断はしない（observed behavior を記録）
- verification: `pnpm test:run`

### Phase 1

**I-04: tag-detail dead chain の削除（export 単位 / Q1 承認後）**

- goal: liveness 表で dead 確定したコードを export / procedure 単位で削除する
- scope: コンポーネント 6 ファイル、`useTagDetailData.ts` の dead hooks 3 つ、`tag-statistics.ts` の dead procedures、関連テスト・stories・i18n キー
- out of scope: `TagDetailPage` / `TagDetailTitle` / `useTagDashboardData` / `getTagDashboard`（live）、**DB RPC の drop（Phase 5 / I-15）**、新 Review 実装
- tasks: ① liveness 表どおりに削除 ② i18n キー削除があるため `pnpm lint:i18n` ③ `/review/tags/[tagId]` の表示が不変であることを確認
- acceptance criteria: knip unused files から該当ファイルが消える。該当ページの挙動・表示不変
- verification: `pnpm test:run && pnpm build && pnpm lint:i18n`、該当ページの Playwright スクリーンショット比較

**I-05: 空 package（@dayopt/utils, @dayopt/server）の削除**

- goal: 実体 export のない 2 package を workspace から除去する
- scope: `packages/utils/`、`packages/server/`、pnpm-workspace.yaml、turbo.json、参照する package.json、lockfile
- out of scope: 他 packages の整理（Q7 / I-22）
- tasks: ①参照ゼロの最終確認（package.json の依存含む）②ディレクトリ削除 ③workspace/turbo 設定更新 ④ `pnpm install` で lockfile 更新
- acceptance criteria: `pnpm build` が全 workspace で成功
- verification: `pnpm install && pnpm typecheck && pnpm build`

**I-06a/b/c: unused exports 削減（a: entry+tags / b: calendar / c: lib+その他）**

- goal: barrel の公開 API を実際に使われるものだけにする
- scope: I-01 の分類表で「削除候補」になった export（feature 単位で 3 issue に分割）
- out of scope: 「要確認」分類の export、ファイル構造変更
- tasks: ① export キーワード除去（内部化）or ファイル削除 ②正当な未参照公開 API は `@public` タグ付与 ③ stories/test のみが参照するものは内部化の妥当性を個別判断
- acceptance criteria: 担当範囲の knip unused exports が 0 または `@public` タグ付きのみ
- verification: `pnpm quality:deadcode && pnpm test:run && pnpm build`

**I-07: knip の CI blocking 化（1 PR・即時）**

- goal: デッドコードの再蓄積を CI で恒久防止する。**Phase 1 の削除完了直後に実施**（Phase 2-4 の churn を保護下で走らせる）
- scope: `apps/product/package.json`（`--no-exit-code` 除去）
- out of scope: 新規 lint ルール追加、観察期間の設置（knip は決定的ツールのため不要）
- tasks: ① baseline がクリーンであること（I-04/I-05/I-06 完了）を確認 ② `--no-exit-code` 除去 ③ わざと unused export を作る検証 PR で CI fail を実証 → revert
- acceptance criteria: unused export を含む PR が CI で fail する
- verification: 検証用 PR の CI 結果

### Phase 2

**I-08: feature barrel 契約の整理 + date-utils.ts の吸収**

- goal: 「barrel = Composition Layer 向け公開 API」の契約を実装と docs の両方で一致させる
- scope: `features/entry/index.ts`（domain 二重 re-export）、`features/tags/index.ts`（tag-colors 定数の二重 export）、各 `domain/index.ts`、`lib/date-utils.ts` → `lib/date/` 吸収、barrel 規約の docs 追記
- out of scope: ディレクトリ移動、lib/date と time-utils の責務統合
- tasks: ①外部参照実績のある export のみ残す ② domain/index.ts を feature 内部用と明記 ③ date-utils.ts の中身（parseDateString）を lib/date/ へ移し import 先を差し替え ④規約を `.claude/rules/feature-boundaries.md` に追記
- acceptance criteria: import 元の変更が機械的（path 差し替えのみ）で、挙動・型 signature 不変
- verification: `pnpm typecheck && pnpm lint:boundaries && pnpm test:run`

**I-22: packages 統合（Q7 承認時のみ・低優先）**

- goal: 型のみの薄い packages を統合し、monorepo の package 境界を「本当に共有するもの」だけにする
- scope: `packages/{domain,billing,types,config,...}` のうち Q7 で統合対象になったもの。apps/web との共有実態の調査を含む
- out of scope: `packages/database`（生成型のため維持）、`packages/ui` / design tokens（apps/web と共有のため維持）、ビルドツール変更
- tasks: ①各 package の参照元を棚卸し（apps/product のみ参照のものを特定）② apps/product のみ参照のものは `src/lib/` 等へ取り込み ③ workspace / turbo / tsconfig paths 更新
- acceptance criteria: `pnpm install && pnpm build` 全 workspace 成功、import path 差し替えのみで挙動不変
- verification: `pnpm install && pnpm typecheck && pnpm build && pnpm test:run`

### Phase 3

**I-09: settings service 層の抽出**

- goal: settings router の直接 supabase 操作 7 箇所（from 5 + rpc 2）を service へ移管し tRPC 3 層に統一
- scope: `features/settings/server/router.ts`、新規 `features/settings/server/settings-service.ts`
- out of scope: procedure の入出力スキーマ変更、optimistic update（I-13）
- tasks: ① EntryService の構造を踏襲した service 新設 ②ロジックを**書き換えずに移動** ③ router は zod 検証 + service 呼び出しのみに ④ service のユニットテスト追加
- acceptance criteria: router 内に `ctx.supabase` 直呼びゼロ。procedure の入出力が完全一致
- verification: `pnpm test:run && pnpm test:integration`

**I-10: auth recovery ロジックの service 抽出（security レビュー必須）**

- goal: `features/auth/server/router.ts` の recovery code ロジック 250+ LOC を service 層へ移動
- scope: `features/auth/server/`（UserService への統合 or auth-service 新設）
- out of scope: ロジックの書き換え・強化、MFA 仕様変更
- tasks: ①移動のみのリファクタ ② security skill 観点のレビュー ③テスト追加（I-18 と連携）
- acceptance criteria: 挙動完全一致、auto mode 不使用、security レビュー記録あり
- verification: `pnpm test:run`、recovery code フローの手動確認

**I-11: useEntryMutations.ts（977 行）の mutation 単位分割**

- goal: 巨大 hook ファイルを mutation 単位に分割し可読性を上げる
- scope: `features/entry/hooks/useEntryMutations.ts` → `hooks/mutations/` 配下へ分割。entry router の rpc 直呼び 1 箇所（router.ts:295 `bulk_soft_delete_entries`）の service 移管も同時に
- out of scope: optimistic update ロジックの変更、公開 hook signature の変更
- tasks: ① create/update/delete/skip 等の単位でファイル分割 ②共有のキャッシュ操作 util を同 dir に抽出 ③従来の import path を barrel で維持 ④ rpc 直呼びを entry-service へ
- acceptance criteria: 呼び出し側の変更ゼロ（または import path のみ）、全テスト green
- verification: `pnpm test:run && pnpm test:e2e:smoke`

**I-12a/b: 巨大 service の責務分割（a: tag-service 1,020 行 / b: entry-service 857 行 + statistics 848 行）**

- goal: service 内の責務境界（CRUD / 階層操作 / 統計など）でファイル分割
- scope: 該当 service ファイル
- out of scope: SQL/RPC の変更、責務境界が曖昧な箇所の無理な分割
- tasks: ①責務マップ作成 ②明確な境界のみ分割 ③ re-export で既存 import 維持
- acceptance criteria: 公開関数の signature 不変、テスト green。分割しない判断をした箇所は理由を PR に記載
- verification: `pnpm test:run && pnpm test:integration`

### Phase 4

**I-13: useUserPreferenceStore の TanStack Query 移行 + settings optimistic update**

- goal: user preference の server state 管理を tRPC query に一本化する
- scope: `lib/stores/useUserPreferenceStore.ts` とその参照元、settings mutations の onMutate/onError/onSettled、このとき触るファイル内の invalidate 統一
- out of scope: 他 2 store（I-14）、invalidate の全域統一、userSettings schema 変更
- tasks: ① 参照元を `api.userSettings.get.useQuery` ベースに置換 ② mutation 後の invalidate 接続 ③ optimistic update を useEntryMutations パターンで実装 ④ store 削除（UI state 混在時は UI 部分のみ残す）⑤ I-03 の characterization tests（gate semantics / timezone 境界）green を確認 ⑥ `profiles.update` 直呼びの tRPC 化（`supabase.auth.updateUser` / `signOut` は現状維持）
- acceptance criteria: characterization tests green、設定変更 → 即時反映 + 失敗時 rollback → リロード後も一致
- verification: `pnpm test:run && pnpm test:e2e:smoke` + 設定変更の手動シナリオ（オフライン失敗含む）

**I-14: calendar / chronotype settings store の TanStack Query 移行**

- goal: 残る server-state store 2 件を I-13 と同方式で移行する（1 store = 1 PR）
- scope: `features/calendar/stores/useCalendarSettingsStore.ts`、`features/chronotype/stores/useChronotypeSettingsStore.ts`
- out of scope: カレンダー描画ロジック、chronotype 計算
- tasks: I-13 と同パターン。calendar は参照箇所が多いため画面単位で段階適用
- acceptance criteria: server state を保持する Zustand store が 0 件になる
- verification: characterization tests + `pnpm test:e2e:smoke`

### Phase 5

**I-15: 孤児 DB RPC の drop migration（手順固定 / I-04 deploy 後）**

- goal: tag-detail dead chain の DB 側（孤児 RPC）を安全手順で除去する
- scope: 新規 `supabase/migrations/*.sql`（drop function のみ）
- out of scope: 既存 migration の書き換え、squash、テーブル変更、**孤児以外の RPC**（52 関数は凍結資産）
- tasks: ① I-04（procedure 削除）が production に deploy 済みであることを確認 ② Sentry で該当 RPC 起因エラーがゼロであることを確認（根拠はコード grep + Sentry 静穏。Supabase ログは保持期間が短く根拠にしない）③ drop migration 作成・local 検証 ④ rollback 手順（liveness 表に記録した定義元 migration の `CREATE OR REPLACE FUNCTION` 再適用、所要数分）を PR 説明に必須記載 ⑤ production 適用は指示後
- acceptance criteria: `pnpm db:fresh` green、手順①②④が PR に記録済み。**注: PR Preview は単一 production project 運用のため DB 分離の安全網として扱わない**
- verification: `pnpm db:fresh && pnpm test:integration`、production 適用後の Sentry 監視

**I-16: RLS snapshot の自動生成 + CI drift check / advisors 棚卸し / \_archive README / ロジック置き場方針**

- goal: 「現在有効な policy / table」を 1 コマンドで生成し CI で drift 検知できるようにし、「新規ロジックは TS / 既存 SQL 凍結」の方針を確定する
- scope: 生成スクリプト（`api:spec:check` と同型）、CI への組み込み、advisors レポート、`supabase/migrations/_archive/README.md`、方針メモ（rules 追記は I-20）、（Q3 用）squash 判断資料
- out of scope: policy 変更、squash の実行、既存 SQL 関数の修正・移植
- tasks: ① pg_policies / table 一覧の生成スクリプト ② CI drift check 追加 ③ `get_advisors`（read-only）で security/performance 確認 → 全件 issue 化 or 対応不要の理由記録 ④ \_archive README ⑤ ロジック置き場方針（新規 TS / 既存凍結 / RPC 新設は原子的バッチのみ）の文書化 ⑥ squash の手順・リスク・所要見積もり資料
- acceptance criteria: スクリプト 1 コマンドで snapshot 再生成可、drift で CI が落ちる、advisors 全件処理済み、方針が文書化済み
- verification: スクリプト実行 + わざと policy docs を改変して drift 検出を確認

### Phase 6

**I-17: RLS integration テストの parameterized suite 化**

- goal: 全 user-owned テーブルの RLS を 1 つの parameterized suite で回帰検知できるようにする
- scope: `src/lib/test/` の integration、`integration.yml` の対象 path
- out of scope: RLS policy 自体の変更
- tasks: ① user-owned テーブル（profiles / entries / tags / user_settings / user_badges / mfa_recovery_codes / reports / api_keys）の「他ユーザー行の select/update/delete 拒否」を parameterize ② service-role 専用テーブル（stripe_webhook_events / email_suppressions）への client アクセス全拒否 ③ I-16 の snapshot と突合 ④ CI トリガー path の確認
- acceptance criteria: 全対象テーブルがカバーされ CI green
- verification: `pnpm test:integration`

**I-18: auth / chronotype / contact のテスト補強**

- goal: テスト手薄 feature の主要ロジックに回帰防止網を張る
- scope: auth service（I-10 後）、chronotype domain、contact service
- out of scope: UI コンポーネントの網羅テスト
- tasks: 公開 API（procedure / domain 関数）の入出力テストを各 feature 5-10 件
- acceptance criteria: 対象 feature のテスト数が各 10 件以上
- verification: `pnpm test:run`

**I-19: project docs の summary.md 整備（3 件）**

- goal: 進行中表示のままの project を確定させ docs の鮮度を回復する
- scope: `apps/storybook/docs/product/projects/{cleanup-2026-04-26, review-granularity-redesign, mcp-server}/`
- out of scope: 設計書本文の書き換え
- tasks: 各 project の実際の到達点を git 履歴から確認し summary.md 作成（未完なら「中断・残課題」を明記）
- acceptance criteria: 3 project すべてに summary.md（workflow.md の完了形式準拠）
- verification: docs ビルド（Storybook）確認

### Phase 7

**I-20: eslint-disable 棚卸し + 再発防止ルール追記**

- goal: 不要化した disable を除去し、本リファクタで決めた規約を rules 体系に固定する
- scope: eslint-disable 43 件、`.claude/rules/`（**barrel 契約 / server state 禁止（Zustand）/ service 層必須 / 新規ロジックは TS・既存 SQL 52 関数は凍結** の追記）、`@typescript-eslint/no-unused-vars` の判断、（任意）ファイル行数 warn lint の検討
- out of scope: 新規 ESLint plugin 導入
- tasks: ① 43 件を「必要 / 不要 / 代替可」に分類して不要分を除去 ② rules 追記（CLAUDE.md は概要のみ維持、skill-design.md の rules/skill 境界に従う）③ no-unused-vars on 化の費用対効果メモ ④ 600 行超 warn の費用対効果判断（見送りなら理由記録）
- acceptance criteria: `pnpm lint` green、rules 追記が既存 rules / skills と非重複
- verification: `pnpm lint && pnpm lint:boundaries`

**I-21: リファクタリング project summary 作成**

- goal: 達成成果・残課題・metrics を記録し project を完了させる
- scope: `apps/storybook/docs/product/projects/codebase-refactoring/summary.md`
- tasks: before/after metrics（LOC 削減、unused 件数推移）、要確認 Q1-Q7 の最終判断記録、見送り事項（squash / packages 統合 / offline 等）の再検討条件
- acceptance criteria: workflow.md の完了形式準拠
- verification: docs レビュー

---

## 5. 実行順序

### 最初にやること（直列）

1. **I-01（knip 修正）** — 全削除作業の根拠。これなしに削除を始めない
2. **要確認 Q1-Q7 の回答取得** — 特に Q1（tag-detail）は Phase 1 のブロッカー。Q4（offline）は製品判断として独立に進めて良い
3. **I-02（liveness 表）/ I-03（characterization tests）** — I-01 完了後に並行可

### 並行できること

- **Track A（削除）**: I-04 → I-06a/b/c → I-05 → **I-07（knip blocking、Track A の締め）**
- **Track B（テスト・docs）**: I-03, I-17, I-18, I-19 は他と独立して常時並行可
- **Track C（service 分離）**: I-09, I-10, I-11 は互いに独立（ただし Track A と同一 feature を同時に触らない）

### 依存関係

```
I-01 ──→ I-06a/b/c ──→ I-07（knip blocking。Phase 1 の締め）
I-02 ──→ Q1 ──→ I-04 ──(production deploy + Sentry 静穏)──→ I-15（RPC drop）
I-03 ──→ I-13 → I-14
I-09 ──→ I-13（settings service が先）
I-10 ←→ I-18（auth テストを先 or 同時）
I-08（barrel 整理）は I-04/I-06 完了後（削除後に整理）
I-22（packages 統合）は Q7 承認後・I-05 完了後
I-16 ──→ I-17（snapshot と suite の突合）
I-20/I-21 は最後
```

### 後回しでよいこと

- migration squash（Q3。判断資料 I-16 のみ先行）
- offline-sync の扱い（Q4 の製品判断待ち。導入設計するなら別 plan）
- packages 統合 I-22（Q7。空 package 削除 I-05 だけ先行）
- 巨大 service 分割の I-12a/b（価値はあるが他をブロックしない）
- Storybook の calendar 複合コンポーネント story 追加（健全度 Low）

### 途中で止めても安全な区切り

- 各 issue = 1 PR = CI green で独立完結（path-limited add、`git diff --cached` ゲート）
- **Phase 1 完了（I-07 の knip blocking 化まで）が最初の大きな区切り**: デッドコードが消え再発防止が効いた状態は、それ以降を中断しても純益
- **Phase 4 の store 移行は 1 store = 1 PR** で、1 つだけ移行して止めても二重管理が部分的に減るだけで害はない
- **I-15（RPC drop）だけは「I-04 production deploy → Sentry 静穏 → drop」の手順を分断しない**（着手するなら一連で、しないなら着手しない）

---

## 検証方法（計画全体）

- 各 PR: `pnpm typecheck && pnpm lint && pnpm lint:boundaries && pnpm test:run`（+ 変更領域に応じ `lint:i18n` / `test:integration` / `build`）
- 削除系 PR: `pnpm quality:deadcode` の件数推移を PR description に記録
- 状態管理移行: characterization tests（gate semantics / hydration 前 mutation 不発火）green + `pnpm test:e2e:smoke` + 設定変更フローの Playwright 確認
- DB 系: コード削除の production deploy → Sentry 静穏確認 → `pnpm db:fresh` green → drop migration → 適用後 Sentry 監視
- 最終確認: I-07 の「わざと壊す PR」で CI ゲートの実効性を実証
