# watching-ai-implementation

策定日: 2026-04-24
状態: skeleton（Project 開始時に本格起草）
前 Project: `ai-feature-scaffolding`（完了、`.storybook/docs/product/projects/ai-feature-scaffolding/` 参照）

## 概要

TBD（Project 開始時に起草）。

Watching AI は Dayopt の AI feature の本体。observer model として calendar entries / tag stats / plan-vs-actual を観測し、週次 reflection report 等を生成する。`ai-feature-scaffolding` で用意した skeleton の上にロジックを埋めていく。

## Scope

TBD

## Non-scope

TBD

## 引き継ぎ事項（ai-feature-scaffolding から）

scaffolding 完了時点で defer された論点。本 Project 開始時に以下を相談ポイント化するか、個別 Step として扱うか判断する:

### 設計論点

- **Observer pattern の具体化**: ai/server が calendar / stats の service をどう観測するか。eslint の `ai/server はサーバー合成層として例外` の意味を rule レベルで確定させる必要
- **stats Layer 3 との整合**: stats の MDX (`Layer3.docs.mdx` 等) には「Edge Function → Anthropic API」経路の構想が記述されている。本 Project の「Next.js server (tRPC) → Anthropic」経路と二重化しないか整合を取る（scaffolding findings F 参照）
- **Haiku free tier / Pro BYOK tier の分岐ロジック**: model 選択と API key 解決の分岐戦略

### 実装論点

- **Anthropic SDK 例外の正規化**: `Anthropic.APIError` の status (429 / 401 等) を TRPCError の code にマップする helper。`ai/lib/` に配置する案が自然
- **BYOK 対応**: per-request client 生成、tier 分岐、UI (設定画面) 設計 → RP3 を α から β に拡張
- **rate-limit 追加**: ai procedure への per-user limit。`@/lib/rate-limit` の tRPC 適用可否調査から
- **Supabase schema 追加**: `ai_runs` / `ai_reports` 等のテーブル、migration の設計
- **notification feature との連携**: AI 生成通知の取り扱い（type + data jsonb pattern に乗せる）

### 運用論点

- **SDK version pin 方針**: 現在 `^0.91.0`、major 0.x の breaking change を避けるなら `~0.91.0` / pin も検討
- **smoke test infra**: vitest の env load 戦略整備（scaffolding Step 6 Part 1 で発覚した unit project への `.env.local` 未 load 問題）

### ai-feature-scaffolding の未達成功条件

- 実 API call による疎通確認（smoke test skip のため未検証）。本 Project の最初の procedure 実装時に実施

## 前提・依存

- `ai-feature-scaffolding` 完了
- `@anthropic-ai/sdk` 導入済み
- `src/features/ai/` の骨格（index.ts / types.ts / lib/anthropic-client.ts / server/router.ts）が存在
- eslint boundaries rule に ai feature 登録済み
- `src/lib/trpc/root.ts` に `ai: aiRouter` 登録済み（空 router）
- `ANTHROPIC_API_KEY` の env 設定（`.env.local` / Vercel env、本 Project 開始時に Tomoya 側で整備）

## 相談ポイント

TBD（Project 開始時に起草）。

## Step 分割

TBD（Project 開始時に起草）。

## 成功条件

TBD（Project 開始時に起草）。
