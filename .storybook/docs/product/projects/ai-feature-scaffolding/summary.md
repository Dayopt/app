# ai-feature-scaffolding — Project Summary

完了日: 2026-04-24
状態: completed
後続 Project: `watching-ai-implementation`

## 概要

`src/features/ai/` の骨格（directory / SDK wrapper / boundaries rule / tRPC 登録）を整備した Project。Watching AI 本体の実装は後続 `watching-ai-implementation` で行う。

## 達成した成果

overview の成功条件との対応:

- [x] `src/features/ai/` が他 feature と同じ colocation pattern で存在
- [x] Anthropic SDK の client が 1 箇所で初期化され、環境変数から API key を読む
- [ ] **未達**: hello world endpoint が client から叩けて、SDK 経由で Claude から response が返る（Step 6 Part 1 smoke test を Tomoya 判断で skip、watching-ai-implementation の最初の procedure 実装時に検証予定）
- [x] `npm run typecheck` / `npm run lint` / `npm run build` が pass
- [x] boundaries rule で features/ai の import 制限が効いている（bidirectional 対称性担保）
- [x] `watching-ai-implementation` の開始地点が明確（overview 雛形を `docs/design/watching-ai-implementation/overview.md` に作成）

## Step 別変更サマリ

- **Step 1** (事前調査): `step-1-findings.md` 作成、RP1-3 を α/γ/α で確定
- **Step 2** (directory 骨格): `src/features/ai/{index.ts, types.ts, server/router.ts}` 作成
- **Step 3** (SDK wrapper): `@anthropic-ai/sdk` install + `src/features/ai/lib/anthropic-client.ts` 作成（factory pattern、env 未設定時 throw）
- **Step 4** (boundaries rule): `eslint.config.mjs` に ai block 新設 + entry/calendar/stats block に bidirectional 対称性追加
- **Step 5** (tRPC endpoint): `ai.ping` procedure 実装、`src/lib/trpc/root.ts` に aiRouter 登録
- **Step 6 Part 1** (smoke test): 実施せず（Tomoya 判断で skip、env load 経路未整備も発覚）
- **Step 6 Part 2** (cleanup + handoff): ping procedure 削除、空 router に戻し、本 summary + watching-ai-implementation overview 雛形作成

## 後続 Project への handoff

### watching-ai-implementation で扱う defer 事項

本 Project 進行中に発生し、scope 外として defer した論点:

- Observer pattern の具体化（ai/server が calendar / stats の service をどう観測するか）
- `ai/server はサーバー合成層として例外` の eslint rule 上での意味確定
- stats Layer 3 の Edge Function 構想との整合（Next.js server tRPC 経路と二重化しないか）
- Anthropic SDK 例外の正規化 helper（rate limit 429 / auth 401 を TRPCError の適切な code にマップ）
- BYOK 対応（per-request client 生成、tier 分岐）
- rate-limit 追加（ai procedure への per-user limit）
- Haiku free tier / BYOK Pro tier の分岐ロジック
- Supabase schema 追加（ai_runs / ai_reports）
- notification feature との連携
- SDK version pin 方針（major 0.x の扱い）
- smoke test の実施（env load 整備含む）

### 未解決の技術的問い（参考）

- `feature-colocation-migration` の実在: overview「前提・依存」に記載したが、`.storybook/docs/product/projects/` での痕跡未確認（別 task 候補）

## scaffolding 完了後の cleanup 候補（別 project 起票候補）

本 Project の作業中に繰り返し観測された、scaffolding 外の改善余地:

- **tailwindcss eslint plugin noise**: `Cannot resolve default tailwindcss config path` が lint 実行ごとに多数出力（Tailwind v4 + flat config の既知問題と推定）。複数 Step で繰り返し報告あり
- **vitest env load strategy**: `.env.local` が vitest の unit project に自動 load されない。env を要する test（stripe / resend / supabase service role / ai 等）の統一方針が未確定
- **eslint Layer 2 block の書式揺れ**: calendar / stats / ai の 3 block で Independent 禁止リストのコメント分節に揺れあり
- **appRouter の alphabetical 整理**: 既存 `user` / `onboarding` 等が非 alpha 順
- **feature-boundaries.md の reality 差分**: `notifications` が列挙されているが `src/features/` 未実装

## 成果物リスト

### 新規ファイル

- `src/features/ai/index.ts`
- `src/features/ai/types.ts`
- `src/features/ai/lib/anthropic-client.ts`
- `src/features/ai/server/router.ts`

### 変更ファイル

- `package.json` / `package-lock.json` (`@anthropic-ai/sdk` 追加)
- `eslint.config.mjs` (ai block 新設 + bidirectional 対称性)
- `src/lib/trpc/root.ts` (`ai: aiRouter` 登録)

### Project docs（本 summary 作成時点で `.storybook/docs/product/projects/ai-feature-scaffolding/` に移動済み）

- `overview.md`
- `step-1-findings.md`
- `summary.md`（本ファイル）
