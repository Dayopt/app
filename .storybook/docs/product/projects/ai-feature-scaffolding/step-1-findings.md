# Step 1 Findings

策定日: 2026-04-24
対象 Project: `ai-feature-scaffolding`（overview: `./overview.md`）
作業種別: 読み取り専用調査

---

## A. feature colocation pattern

### 既存 feature 一覧

`src/features/` 直下: `auth`, `calendar`, `chronotype`, `contact`, `entry`, `onboarding`, `settings`, `stats`, `tags`, `tour`（10 feature）

### 代表 feature の directory 構造

**`src/features/entry/`**（Layer 1 中核、server + client 両持ち）

```
src/features/entry/
├── index.ts                       # barrel export
├── types/                         # 型定義（複数に分割する場合 dir）
├── schemas/                       # Zod schema（+ __tests__）
├── components/                    # UI（card / inspector など）
├── hooks/                         # React hooks（+ mutations/ / __tests__）
├── stores/                        # Zustand store
├── lib/                           # 内部 utility（+ __tests__）
└── server/                        # tRPC router + service（+ __tests__）
```

**`src/features/stats/`**（Layer 2 体験、server 含む）

```
src/features/stats/
├── index.ts
├── types/, constants/, stores/, hooks/, lib/
├── components/                    # sub-category で細分化（metrics / insights / progress / charts 等）
└── server/                        # __tests__/ あり、`badges-router.ts` を export
```

**`src/features/tags/`**（Layer 0 基盤）

- server/ + client / lib / stores / hooks / components。他 feature に依存しない。

### `index.ts` の書き方

- 全部 **named export** 、`export *` は使わない。
- セクションを `// === Types ===`, `// === Schemas ===`, `// === Hooks ===`, `// === Components ===`, `// === Server ===` 等のコメントで明示的に区切る。
- 末尾に「ここにないものは feature 内部専用」のコメント（entry/index.ts:84）。
- server layer の export は明確にガード（「Service layer — server-only ガードで保護済み」と明記）。

### 命名規約（観察から抽出）

- router file: `server/router.ts` が基本。ただし entry は `server/router-index.ts`、stats は `server/badges-router.ts` と `settings` は `server/billing-router.ts` / `server/router.ts` が併存。**命名はやや揺れている**（要相談）。
- service file: `server/entry-service.ts` 形式（`{feature-name}-service.ts`）。
- lib 直下に置く内部 utility は目的を表す具体名（`entry-normalization.ts`, `entry-status.ts`, `entry-to-ical.ts`）。

---

## B. `src/lib/` の既存構成

### 直下エントリ（ファイル + ディレクトリ）

**ディレクトリ**: `analytics`, `auth`, `cache`, `components`, `date`, `dev`, `email`, `errors`, `hooks`, `i18n`, `pwa`, `rate-limit`, `security`, `sentry`, `server`, `stores`, `stripe`, `styles`, `supabase`, `tanstack-query`, `test`, `trpc`, `turnstile`, `types`, `zustand`, `__tests__`

**ファイル**: `app-info.ts`, `app-url.ts`, `auth-error.ts`, `breakpoints.ts`, `calendar-constants.ts`, `chronotype-defaults.ts`, `cookie-consent.ts`, `database.types.ts`, `date-utils.ts`, `logger.ts`, `og-colors.ts`, `safe-redirect.ts`, `tag-colors.ts`, `time-utils.ts`, `timezone-utils.ts`, `toast.ts`, `user.ts`, `utils.ts` 等

### feature と lib の境界ルール（観察から）

- lib/ は **feature 非依存の再利用コード**（CLAUDE.md 明記）。lib/ → features/ の import は eslint で error（eslint.config.mjs:86-111）。
- ただし 3 つの明示的例外が ignores に列挙されている:
  - `src/lib/trpc/root.ts` — Server Composition Layer（全 router の集約点）
  - `src/lib/hooks/useTheme.ts` — app 層 theme-provider からの re-export
  - `src/lib/email/router.ts` — email feature に相当する router が lib 下に同居（歴史的配置と推定）
- SDK / 外部サービス client は lib に集約される傾向: `lib/supabase/`, `lib/stripe/`, `lib/sentry/`, `lib/turnstile/`（Cloudflare Turnstile）。**SDK 配置先として lib/ は前例が厚い**。
- cross-cutting UI state は `lib/stores/` に集約（feature-boundaries.md 明記）。

---

## C. boundaries rule

### config の所在

`eslint.config.mjs`（flat config）。`eslint-plugin-boundaries` は使用せず、**`no-restricted-imports` rule で DAG を表現**している（標準 ESLint rule ベース）。

### 階層定義（eslint.config.mjs:70-214 のコメントから）

| 層             | feature                                                    | import 可能範囲        |
| -------------- | ---------------------------------------------------------- | ---------------------- |
| Layer 0 (基盤) | `tags`, `chronotype`                                       | 他 feature 依存ゼロ    |
| Layer 1 (中核) | `entry`                                                    | L0 の barrel のみ      |
| Layer 2 (体験) | `calendar`, `stats`, `ai`                                  | L0 + L1 の barrel のみ |
| Independent    | `auth`, `contact`, `notifications`, `onboarding`, `tour`   | 他 feature 依存ゼロ    |
| 除外済み       | `settings`（app 層 composition へ移動）, `palette`（廃止） |                        |

※ コメント上は `ai` が Layer 2 に列挙されているが、**実際の rule ブロックには `src/features/ai/**/\*.{ts,tsx}` の設定が存在しない\*\*。→ Step 4 で追加必要。

### 既存 import 許可 matrix（抜粋）

- lib/ → features/ : **禁止（error）**、`src/lib/trpc/root.ts` など 3 点のみ例外
- features/entry/ → features/tags, features/chronotype : barrel のみ可
- features/calendar/ → features/entry, features/tags, features/chronotype : barrel のみ可
- features/calendar/ ↔ features/stats : **同層禁止**
- app/ → features/\* : barrel のみ（deep import 禁止、eslint.config.mjs:216-239）

### ai feature 追加時に必要な変更点（列挙のみ、実装しない）

1. **Layer 2 block を ai 用に新設**: eslint.config.mjs に
   `files: ['src/features/ai/**/*.{ts,tsx}']` の block を追加し、calendar/stats と同等の `no-restricted-imports` patterns を設定（同層 = calendar / stats を禁止、Independent 禁止、L0/L1 は barrel のみ）。
2. **feature-boundaries.md のコメント**: すでに `ai` が Layer 2 にリスト済み・`ai/server はサーバー合成層として例外` との記述あり。ただし「サーバー合成層の例外」の具体的な免除対象（lib → features/ai/server の import 可否等）は **明文化されていない** → RP への影響に記載。
3. **tsconfig paths**: `@/features/*` alias が既存で効いているため、ai 追加で新規 paths 変更は不要（tsconfig.json は本 Step では未確認だが、他 feature が @/ エイリアスで通っているため問題なし想定）。

---

## D. Anthropic SDK 導入状況

- `package.json` に `@anthropic-ai/sdk` / `anthropic` は **未インストール**（grep 0 件）。
- Step 3 で `npm install @anthropic-ai/sdk` が必要。
- 依存追加基準（code-style.md）に照らすとブラウザ標準では実現不可・既存依存で代替不可のため追加妥当。バージョン・stars は Step 3 着手時に確認。

---

## E. 環境変数

- **`src/env.ts` に `ANTHROPIC_API_KEY: z.string().optional()` が既に定義済み**（env.ts:29）。
  - server-only proxy で Zod バリデーションされる。
  - optional のため、未設定でも起動はする。本 Project の scaffolding では optional のまま。Watching AI 本実装で required 化を検討する設計になっている。
- `.env.example` は読み取り権限が denied されて直接確認不可（permission setting）。src/env.ts に定義されているため、.env.example にも記載されている可能性が高いが **未確認**（要相談 or Tomoya 側確認）。
- Vercel env（production / staging / preview）の設定状況は本 Project 対象外（overview 明記）。

---

## F. 既存 AI 関連コード

grep `anthropic|claude-3|claude-4|@anthropic-ai` でヒットしたもの:

### 実コード

- **src/env.ts:29** — `ANTHROPIC_API_KEY` の env 定義のみ。実使用なし。

### 設計ドキュメント（MDX、実装なし）

- `src/features/stats/components/insights/Layer3.docs.mdx`
  - Insights の「Layer 3」構想: `PostgreSQL RPC → Edge Function → Anthropic API (Haiku 4.5) → reflections テーブル → tRPC → UI` というデータフロー記述（22-48 行目付近）
- `src/features/stats/components/docs/DataFlow.docs.mdx`
- `src/features/stats/components/docs/LayerArchitecture.docs.mdx`
  - 同様に将来構想としての Anthropic 連携を記述

### supabase 配下

- `supabase/migrations/20260415200100_create_api_keys.sql` — 「Obsidian / Claude Code 等」の外部連携 API key table。**Anthropic SDK 連携ではなく、Dayopt の API を外部から叩くためのキー管理**。誤解注意。
- `supabase/config.toml` — Claude Code 言及のみ（ドキュメント記述）。
- Edge Functions (`supabase/functions/`) は `send-auth-email` / `_shared` / `deno.json` のみ。**AI 系 Edge Function は未実装**。

### 整理対象（指摘のみ）

- stats の MDX 3 ファイルで記述されている「Edge Function → Anthropic API」経路は、`ai-feature-scaffolding` が取る「Next.js server (tRPC) → Anthropic API」経路と**異なる想定**。本 Project では両立するが、watching-ai-implementation または stats Layer3 実装時に整合を取る必要がある（要相談）。

---

## G. server endpoint pattern

### tRPC routers の所在

- **集約点**: `src/lib/trpc/root.ts`
- **各 feature router**: `src/features/{feature}/server/router.ts` もしくは類似（router-index.ts / {name}-router.ts）
- 登録済み: `user`, `contact`, `entries`, `onboarding`, `badges`, `billing`, `userSettings`, `tags`, `email`
- router 実装パターン（entry/server/router.ts より）:
  - `createTRPCRouter` / `protectedProcedure` を `@/lib/trpc/procedures` から import
  - Zod schema を feature 内 `schemas/` から import
  - service 層 `create{Feature}Service()` を同 feature 内 `server/service-index.ts` 等から import
  - エラーは `handleServiceError(error)` で正規化（`@/lib/trpc/errors`）

### `app/api/` の構成（既存 Route Handler）

```
src/app/api/
├── auth/                          # REST 維持（認証は tRPC 外）
├── beacon/entry-save/             # sendBeacon 受け口
├── csp-report/                    # CSP 違反レポート
├── health/                        # ヘルスチェック
├── trpc/[trpc]/route.ts           # tRPC entry (nodejs runtime)
├── v1/calendar/[token]/           # iCal public feed（トークン認証）
└── webhooks/
    ├── resend/                    # メール配信 webhook
    └── stripe/                    # 決済 webhook
```

- **Next.js Route Handler の既存 pattern**: トークン認証 / public webhook / beacon など **tRPC で扱いにくいケース専用**。`NextRequest / NextResponse` ベース、`@/lib/supabase/oauth` の service role client や `@/lib/rate-limit` と連携。
- tRPC route (`api/trpc/[trpc]/route.ts`): fetchRequestHandler + logger + ctx.userId ログ。エラーを構造化ログ出力（input は dev 環境のみ記録）。

### RP2 の判断材料（observation）

- **tRPC が 9 router、Route Handler が 7 path** で両者併用済み。共存自体は問題なし。
- streaming SSE 用 Route Handler の**先例なし**（全 Route Handler が one-shot レスポンス）。
- 認証 / rate-limit は tRPC 側は procedure wrapper、Route Handler 側は個別実装で分かれている。

---

## RP への影響分析

### RP1 (SDK wrapper 配置)

**結論**: overview の推奨どおり **α（`src/features/ai/internal/client.ts`）を支持**。

根拠:

1. ai 以外で Anthropic SDK を叩く先例・計画ともに検出されなかった。stats の MDX が示す Edge Function 経路は **Deno 側の処理**で、Next.js の SDK wrapper とは別系統。solo dev 段階で L2 feature 内に閉じ込めても再配置コストは小さい。
2. 一方、**lib/ 側に SDK を集約する前例は厚い**（lib/supabase, lib/stripe, lib/sentry, lib/turnstile）。β を取った場合も既存 pattern と整合する。
3. feature-boundaries.md の `ai/server はサーバー合成層として例外` の記述は、「ai/server から他 feature の server を import して集約できる」という逆方向の例外を意図していると読める。SDK wrapper を lib に置く動機にはならない。

補足: overview で `src/features/ai/internal/` を想定しているが、既存 10 feature のいずれも `internal/` という名前のサブディレクトリを持たない（ディレクトリ名は `server/` `lib/` `hooks/` 等の規定名）。→ **`internal/` ではなく `lib/` を使うのが整合的**（feature-boundaries.md: 「utils/ は使わない、lib/ に統一」）。Step 2 で要検討。

### RP2 (server endpoint 設計)

**結論**: overview の推奨どおり **γ（tRPC = sync、Route Handler = streaming 専用）を支持、ただし scaffolding は tRPC のみで OK**。

根拠:

1. 既存 Route Handler は **非 tRPC 用途限定**（webhook / token / beacon）で、streaming SSE は未採用。streaming が本当に必要かは watching-ai-implementation で判断すべき。
2. scaffolding 時点で `app/api/ai/` を空ディレクトリだけ切るのは、既存 `app/api/` の構造上浮きやすい（既存は全て具体的な route.ts を持つディレクトリ）。**Route Handler のプレースは Step 5 では作らず、watching-ai-implementation で streaming 要件が確定してから追加**でも十分。overview の β の「空ディレクトリ」記述は再検討を推奨。
3. hello endpoint は tRPC `ai.ping` procedure で overview 通り実装。router 名は次項で決定。

### RP3 (public API 粒度)

**結論**: overview の推奨どおり **α（server function のみ export）を支持**。

根拠:

1. scaffolding 段階で client component を出すと、後で形が変わった時の書き換えが発生する。
2. 既存 feature の index.ts pattern（entry, stats）から見ても、server export セクションを持つ feature は存在する（entry が `EntryService` を server-only ガード付きで export）。同じ pattern に乗れる。

---

## ⚠️ 要相談事項

1. **`internal/` vs `lib/` のディレクトリ名**: overview は `src/features/ai/internal/client.ts` を想定しているが、既存 feature は全て `lib/` で統一されており、feature-boundaries.md も「`utils/` は使わない、`lib/` に統一」と明記。→ **`src/features/ai/lib/anthropic-client.ts` が規約整合的**。overview の該当記述を修正すべきか Step 2 で判断。

2. **router file の命名**: 既存が揺れている（`router.ts` / `router-index.ts` / `badges-router.ts` / `billing-router.ts`）。ai は複数 router に分かれるか？ 単一で良ければ `server/router.ts`、複数なら `server/{sub}-router.ts` 方式。scaffolding 段階は 1 本で十分と推定 → `src/features/ai/server/router.ts` を推奨。

3. **`.env.example` 未確認**: 権限制限で直接読めていない。`ANTHROPIC_API_KEY` のエントリが既に記載されているか Tomoya 側で確認してほしい。未記載なら Step 3 で追記する（`.env.example` は Read 拒否でも手動で編集可能な想定）。

4. **stats MDX の Edge Function 経路との整合**: 本 Project は Next.js server (tRPC) → Anthropic 経路を作る。stats Layer 3 実装時に Edge Function 経由とする方針と衝突する可能性がある。scaffolding 段階では無視して問題ないが、watching-ai-implementation 前に方針統一が必要。

5. **`feature-boundaries.md` の `ai/server はサーバー合成層として例外` の具体化**: 「サーバー合成層」が何を指すか文書化されていない（app 層の Composition Layer はクライアントサイドの合成点）。Step 4 の eslint rule 追加時に、この例外の意味を確定する必要がある。仮説:「ai/server から他 feature の `server/service-*.ts` を直接 import して agentic に組み合わせる」を認める例外 → Watching AI 本実装で required になる可能性あり。

---

## 次 Step (Step 2) への引き継ぎ事項

### 踏襲する pattern の具体的 reference

- **feature directory 構造の模範**: `src/features/entry/` または `src/features/stats/`。index.ts のコメント分節、server-only ガード表記は entry の書き方を模倣。
- **barrel export の書式**: `src/features/entry/index.ts`（セクションコメント付き named export、末尾に「ここにないものは feature 内部専用」）。
- **server layer**: `src/features/entry/server/router.ts` の冒頭 import 群（TRPCError, z, createTRPCRouter, protectedProcedure, handleServiceError, 各 schema, service）を模範。
- **service 層の命名**: `ai-service.ts`（`{feature-name}-service.ts` 形式）。
- **tRPC root への登録**: `src/lib/trpc/root.ts` の appRouter に `ai: aiRouter,` を追加（import 行も alphabetical 維持）。

### 先回りで決めておくべき naming

- feature key: `ai`（eslint / root router / i18n namespace すべて `ai`）
- router key（root 上の名前）: `ai`
- SDK client 関数名（Step 3 で実装）: `createAnthropicClient()` を overview 記載通り採用
- SDK client file path 候補: `src/features/ai/lib/anthropic-client.ts`（上記要相談 1 に従う）
- 最小 procedure: `ai.ping`（固定 prompt 投げて response を返すだけ）

### blast radius サマリ（Step 2 以降の見通し）

| Step | 影響範囲                                                                          |
| ---- | --------------------------------------------------------------------------------- |
| 2    | `src/features/ai/` 新規のみ。既存 import への影響ゼロ                             |
| 3    | package.json / lockfile 変更 + `src/features/ai/lib/*` 追加                       |
| 4    | eslint.config.mjs に ai block 追加 → lint 全体に波及（違反 0 を維持）             |
| 5    | `src/lib/trpc/root.ts` への 1 行追加 + ai router 実装。tRPC client 型が拡張される |
| 6    | docs 移動（`docs/design/` → `.storybook/docs/product/projects/`）と summary       |
