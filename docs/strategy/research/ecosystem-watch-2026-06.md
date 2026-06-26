# エコシステム調査 2026-06（AI SDK 7 / Instant Navigations / GitHub Actions parallel steps）

記録日: 2026-06-26
対象 issue: #1420 / #1421 / #1422

2026-06 に出た 3 つのエコシステム update を Dayopt 視点で評価し、採用判断を残す。各項目を「採用 / 後で採用 / watch」のいずれかに分類する。

## AI SDK 7（#1420）

### 背景

Vercel AI SDK 7 が公開。Node 22+ 必須、ESM-only（CommonJS export 撤廃、全 package が `"type": "module"`）。agent / tool context 分離、approval policy、stream helper、multi-step result 形状の変更を含む。v7 codemod が rename / import 移動の大半を自動化するが、runtime 要件・ESM import・tool context 分離などは手動判断が残る。

### 現状調査（Dayopt の前提）

- Vercel AI SDK（`ai` / `@ai-sdk/*`）は未導入。
- `@modelcontextprotocol/sdk` 1.29.0 を導入済み、`apps/product/src/app/api/mcp/` に MCP HTTP server（OAuth bearer + `entries.list` tool）が稼働。MCP server は AI SDK に依存せず単体で完結する。
- Node。CI は既に 22（`.github/workflows/ci.yml` の `NODE_VERSION`）。local の `.nvmrc` のみ 20 だった → 本ブランチで 22 に整合。
- ESM。`apps/web` は `"type": "module"`、`apps/product` は Next.js（bundler moduleResolution）。pnpm 11 / Turbo。

### Dayopt 影響

- 前提（Node 22 / ESM）は満たせる。技術的ブロッカーはない。
- ただし現状 LLM を呼ぶ機能（agent / streaming / chat）の実装計画が未確定。AI SDK は「Dayopt から LLM を呼ぶ」ための SDK であり、MCP server（外部 AI クライアントに Dayopt データを露出する側）とは役割が逆。今すぐ Dayopt 側に AI SDK を入れる用途がない。

### 判断: 後で採用（defer）

LLM 機能（agent / streaming 等）を Dayopt に実装する意思決定が出た時点で採用評価する。それまでは前提整合（Node 22）のみ済ませ、SDK 自体は入れない。cross-ref: [ADR-003 MCP統合](../../architecture/adr/003-mcp-integration.md) / [ADR-004 3層AIアーキテクチャ](../../architecture/adr/004-ai-architecture-layers.md)。

### 再評価トリガ

- Dayopt に LLM を呼ぶ機能（AI insights / agent / chat）を実装する decision が出た時。
- その際は v7 codemod 前提で、MCP SDK 1.29.0 との互換も確認する。

## Next.js 16.3 Instant Navigations（#1421）

### 背景

Next.js 16.3 Preview で Instant Navigations が発表。client 駆動 SPA の応答性を、server 駆動モデルの利点を保ったまま実現する一連の機能（Partial Prefetching, Instant Insights 等）。

### 現状調査（Dayopt の前提）

- app は Next.js 16.2.9（`apps/product` / `apps/web`）、React 19。16.3 は未導入。
- 既に router cache（`next.config.mjs` の `staleTimes` dynamic 30s / static 180s）+ server prefetch（`(workspace)/_server/calendar-prefetch.ts`）+ client prefetch（`useCalendarDataLayer`）を併用。
- Calendar（day/week/[nday]）は `loading.tsx` あり。settings は `loading.tsx` なし。

### Dayopt 影響

- Calendar ⇄ settings の遷移体感に効く可能性。ただし 16.3 はまだ pre-production（Preview）で、Safari の Instant Insights 不具合等の既知問題あり。
- React Compiler は next-intl の context 伝播競合で無効化済み。Instant Navigations の streaming モデルと CalendarNavigationProvider（遷移中もツリーを保持）の相互作用は要検証。

### 判断: watch 継続

Preview のため実装変更しない（issue 方針どおり）。

### 再評価トリガ

- 16.3 が stable 化し、app を 16.3 に上げた後。
- その時点で Calendar（day/week/[nday]）遷移を Playwright / 実測で before/after 比較し、破壊的変更（特に next-intl / CalendarNavigationProvider 周り）の有無を確認する。

## GitHub Actions parallel steps（#1422）

### 背景

2026-06-25、GitHub Actions が job 内 step の並列実行を GA（`background: true` / `wait` / `wait-all` / `cancel` の 4 keyword、および group を background+wait に展開する `parallel` sugar）。従来 step は直列で、並列化は job 分割か matrix のみだった。

### 現状調査（Dayopt の前提）

CI（`.github/workflows/ci.yml`）は既に job レベルで並列化済み。

- Stage 1: `lint` ∥ `typecheck`
- Stage 2: `packages-build` → `test` ∥ `build` ∥ `web-build`
- Stage 3: `bundle-size` ∥ `e2e`、`quality-gate` で集約

ボトルネック分析。

- critical path ≈ Stage1（lint/typecheck）→ packages-build → build → e2e。e2e（最大 15min）が支配的。
- 各 job が個別に `pnpm install --frozen-lockfile`（約 60-90s）を重複実行（9 job）。pnpm store / turbo cache の job 横断キャッシュは未導入。
- `lint` job は install 後に 8 個の独立チェック（ESLint / boundaries / Prettier / Workspace Prettier / License / i18n / Story taxonomy / dead code）を直列実行。lint は Stage1 ゲートで全 Stage2 が `needs` するため、ここの短縮は critical path に効く。

### job 分割 vs steps 並列化の比較

| 方式                          | 利点                                                                                   | 欠点                                                                                                | lint への適合                 |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| job 分割                      | log / 失敗箇所が job 単位で明確、実績あり                                              | job ごとに install（約 90s）重複。8 チェックを 8 job にすると install overhead が支配し改善が乏しい | 低（install 重複が無駄）      |
| steps 並列化（新 `parallel`） | install 1 回を共有し、その後のチェックのみ並列。step 単位で log group / 失敗箇所が残る | GA 直後（2026-06-25）で hosted runner 実績が浅い。4-core runner で同時実行数を増やすと CPU/mem 競合 | 高（install 共有 + 独立並列） |
| 1 step 内 shell `&` / `wait`  | 新機能不要・確実                                                                       | log が interleave し失敗箇所の特定が劣化（issue が懸念する点）                                      | 中                            |

`lint` job は「1 install を共有した後の独立チェック群」であり、install を共有したまま checks のみ並列化する方式（native steps 並列化 / shell `&`）が最も適合する。

### 判断: 採用（lint job を shell lane で並列化）

当初 native `parallel`（2026-06-25 GA）を試したが、hosted runner が未対応で workflow parse error（job が 1 つも起動せず 0s で fail）となった。そこで確実に動く **1 step 内の shell `&` / `wait` 方式**へ切替え、`lint` job の 8 チェックを 3 lane に並列化（install は 1 回のまま、重い ESLint / knip を個別 lane に分離）。lane ごとに log を退避し `::group::` で表示して失敗箇所を明確にする（interleave 懸念への対処）。issue の「小さく 1 workflow で試す」に沿い lint 1 job で検証する。実測は本 PR の Actions run を参照。cross-ref: [ADR-006 CI品質ゲート段階的導入ロードマップ](../../architecture/adr/006-ci-quality-gates-roadmap.md)（proposed）。

不採用とした隣接策（follow-up 候補）。

- pnpm store / turbo remote cache の job 横断キャッシュ（install overhead 9 重複の解消）。効果は大きいが別 issue 級。
- e2e の shard 化（critical path 支配の e2e 短縮）。同上。

### 再評価トリガ

- native `parallel` 構文が hosted runner で利用可能になったら shell lane から移行する（step 単位の log group が標準で得られ、interleave 対処が不要になる）。
- lint 短縮効果が小さければ、install キャッシュ導入を別 issue 化する。
