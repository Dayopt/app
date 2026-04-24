# ai-feature-scaffolding

策定日: 2026-04-24
状態: draft（overview 確認中）
後続 Project: `watching-ai-implementation`

## 概要

`src/features/ai/` の骨格を用意する Project。Watching AI 本体の実装は後続 Project `watching-ai-implementation` で行う。

本 Project は「器」の作成に特化する。ロジックは空でよい。型と境界だけ通す。

### なぜ分割するか

AI feature は Watching AI のロジック（observer / prompt / reasoning loop）が主役だが、それを載せる土台（directory 構造 / SDK wrapper / boundary / server endpoint）の設計自体に judgement が要る。土台とロジックを 1 つの Project にまとめると、Step 数が膨らみ、設計決定が途中で揺れるリスクが高い。先に土台を固めてから中身を埋める 2 段構成にする。

## Scope

- `src/features/ai/` directory の新設（feature-colocation-migration pattern に準拠）
- Anthropic SDK wrapper の配置場所決定と最小実装
- API route / server endpoint の雛形（hello world level）
- boundaries rule / tsconfig paths の追加
- feature 内 public API surface の決定（index.ts から何を export するか）
- smoke test（endpoint → SDK → Claude response が 1 往復通ることの確認）

## Non-scope

以下はすべて後続 `watching-ai-implementation` へ:

- Watching AI ロジック本体（observer / prompt / reasoning loop）
- Haiku 呼び出しの実運用ロジック
- BYOK の UI / 鍵管理 / tier 分岐
- Supabase schema 変更（ai_runs / ai_reports 等のテーブル）
- Stats / Notification feature との接続
- プロンプト設計 / system prompt
- stats Layer 3 の Edge Function 構想との整合（watching-ai-implementation の相談ポイント化、findings F / 要相談 4 参照）
- `ai/server はサーバー合成層として例外` の具体化（Observer pattern 設計時に本格議論、findings C / 要相談 5 参照）

## 前提・依存

- feature-colocation-migration が完了済み → 既存 feature（calendar / stats / notification 等）と同じ colocation pattern で書く
- eslint-plugin-boundaries が稼働中 → rule 追加が必要
- `@anthropic-ai/sdk` の導入状況は Step 1 で確認
- `ANTHROPIC_API_KEY` の Vercel env 設定状況は Step 1 で確認

## 相談ポイント

### RP1: Anthropic SDK wrapper の配置

現時点で Dayopt における SDK 利用箇所は ai feature のみの想定。ただし将来的に admin tool や migration script から one-shot で叩くケースが起きる可能性はある。

- **Option α: `src/features/ai/lib/anthropic-client.ts`**
  - feature 内に閉じる。他 feature からは ai の public API 経由でしか利用不可。
  - Pro: feature 独立性が最も高い。境界が明確で boundaries rule と整合する。
  - Con: 将来 ai 以外が直接 SDK を叩きたくなった時に再配置が必要。

- **Option β: `src/lib/anthropic/client.ts`**
  - feature 外の共通層。複数箇所から import 可能。
  - Pro: 拡張に強い。環境変数 / retry / logging / observability を一元化しやすい。
  - Con: features/ai/ が薄くなる。「feature と lib どちらに置くか?」の判断が今後も発生。

- **Option γ: α で開始し、必要が出た時点で β へ昇格（YAGNI pattern）**
  - Pro: 小さく始められる。Dayopt 現状の規模感に合う。
  - Con: 昇格タイミングの判断が必要（watching-ai-implementation 中に迷う可能性あり）。

**推奨**: α。Dayopt は solo dev で ai 以外の SDK 利用は当面発生しない見込み。Watching AI が ai feature の責務として明確に閉じているので、内部 client も feature に閉じるのが整合的。β への昇格コストは `git mv` + import 書き換えだけで小さい。

なお配置先 directory 名は `internal/` ではなく `lib/`（既存 feature の命名規約に従う。`src/features/entry/lib/` 等が先例。Step 1 findings A および 要相談 1 参照）。

**Tomoya の選択**: \_\_\_

### RP2: server endpoint の設計方針

Watching AI が streaming を要するかで選択が変わる。現時点では observer model なのでリアルタイム chat ではないが、weekly reflection report 生成時に progress を見せるなら streaming が欲しい可能性はある。

- **Option α: tRPC router (`server/routers/ai.ts`) のみ**
  - 既存 tRPC 体系に合わせる。型安全性が揃う。
  - Con: streaming SSE の扱いが tRPC では面倒。将来 streaming が必要になった時に追加工事。

- **Option β: Next.js Route Handler (`app/api/ai/*/route.ts`) のみ**
  - streaming / SSE / edge runtime に素直。
  - Con: 既存 tRPC と混在する。型は手動管理。

- **Option γ: 両立（tRPC = sync 呼び出し用、Route Handler = streaming 専用）**
  - 用途で使い分け。
  - Con: onboarding 複雑度は上がるが solo dev なので実害は小さい。

**推奨**: γ（長期方針）。ただし scaffolding では tRPC のみ実装し、Route Handler の空ディレクトリは作らない。既存 `app/api/` が全て具体的な route.ts を持つ構造（findings G 参照）なので、空ディレクトリは浮く。streaming の必要性が確定したら watching-ai-implementation で `app/api/ai/` を新設する。

**Tomoya の選択**: \_\_\_

### RP3: features/ai/ の public API 粒度

ai feature が client component を持つかどうか。

- **Option α: server function のみ export**
  - client 側からは tRPC / fetch 経由でしか呼べない。純粋 backend feature。

- **Option β: server function + 一部 client component（BYOK 入力 UI、model 選択 UI 等）**
  - UI を ai feature 内に同居させる。

**推奨**: 現段階では α で開始。BYOK UI は watching-ai-implementation フェーズで β に拡張する判断をする。scaffolding で UI skeleton を作っても空振りする可能性が高い。

**Tomoya の選択**: \_\_\_

## Step 分割（案）

### Step 1: 事前調査

**目的**: 既存 repo 状態の確認と前提の確定。

調査項目:

- 既存 feature（calendar / stats / notification 等）の directory 構造と index.ts の書き方
- `src/lib/` の既存構成
- eslint-plugin-boundaries の current rules（どの feature が何から import 可能か）
- `@anthropic-ai/sdk` の package.json 導入状況
- `ANTHROPIC_API_KEY` の Vercel env（production / staging / preview）設定状況
- 既存 AI 関連コード（存在するなら所在と現状）

**成果物**: 調査報告を overview.md に追記 or `step-1-findings.md`

**blast radius**: 読み取り専用

### Step 2: directory 骨格作成

**目的**: `src/features/ai/` を空の skeleton として起こす。

作業:

- `src/features/ai/` + sub-directory（Step 1 で確認した pattern に従う）
- `src/features/ai/index.ts`（public API 宣言、export は placeholder）
- 必要な empty file 群（`lib/`, `server/`, `types.ts` 等）

**blast radius**: 新規ファイルのみ。既存 import への影響なし。

### Step 3: SDK wrapper 配置（RP1 決定に従う）

**目的**: Anthropic client の initialization を通す。

作業:

- `@anthropic-ai/sdk` 未導入なら install
- wrapper 実装（RP1 で決定した場所）
- 環境変数 load と validation
- 最小 function export（例: `createAnthropicClient()`）

**blast radius**: 新規 + package.json / lockfile

### Step 4: boundaries rule / tsconfig paths

**目的**: feature/ai の境界を lint で保証。

作業:

- eslint-plugin-boundaries config に ai feature を追加
- 他 feature からの import 可否ルール
- tsconfig paths alias（必要なら）

**blast radius**: config file のみ、ただし lint 全体に波及

### Step 5: server endpoint 雛形（RP2 決定に従う）

**目的**: client → ai feature → SDK の経路を 1 本通す。

作業:

- tRPC router の雛形（`src/features/ai/server/router.ts` に `ai.ping` 1 procedure）
- `src/lib/trpc/root.ts` の appRouter に `ai: aiRouter` を登録（import は alphabetical 維持）
- hello world endpoint（`ai.ping`: 固定 prompt を Claude に投げて response を返すだけ）
- 認証 / rate limit は placeholder comment のみ

**blast radius**: 既存 router / routing 構造への追加

### Step 6: 動作確認 + docs

**目的**: scaffolding の疎通確認と後続 Project への引き継ぎ。

作業:

- hello world endpoint を dev 環境で叩いて 200 + Claude response を確認
- `summary.md` 作成
- Project を `.storybook/docs/product/projects/ai-feature-scaffolding/` へ git mv
- watching-ai-implementation の overview 雛形を新規作成（引き継ぎ事項を明記）

**blast radius**: docs + git mv

## 成功条件

- [ ] `src/features/ai/` が他 feature と同じ colocation pattern で存在
- [ ] Anthropic SDK の client が 1 箇所で初期化され、環境変数から API key を読む
- [ ] hello world endpoint が client から叩けて、SDK 経由で Claude から response が返る
- [ ] `npm run typecheck` / `npm run lint` / `npm run build` が pass
- [ ] boundaries rule で features/ai の import 制限が効いている
- [ ] `watching-ai-implementation` の開始地点が明確（overview 雛形が存在）

## 共通ゲート適用方針

- path-limited add: 全 Step で必須
- `git diff --cached`: 全 commit 前に必須
- typecheck / lint / build: Step 4, 5, 6 で必須
- Storybook 視覚確認: 本 Project では基本発生しない（RP3 で α 選択の場合）

## 次 Project への継ぎ（参考）

`watching-ai-implementation` で扱う予定:

- Observer pattern（calendar entries / tag stats / plan-vs-actual を watch）
- Prompt 設計と system prompt 管理
- Haiku free tier / BYOK Pro tier の分岐ロジック
- Weekly reflection report 生成
- Supabase schema 追加（ai_runs / ai_reports 等）
- Notification feature との連携（AI 生成通知の取り扱い）

本 Project で用意した skeleton の上にロジックを埋めていく構造。
