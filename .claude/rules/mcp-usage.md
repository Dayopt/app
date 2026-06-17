# MCP サーバー利用ガイドライン

Opus 4.7 はツール呼び出しが控えめになる傾向がある。以下の場面では積極的に MCP を呼ぶこと。推測より確認を優先する。

接続済みサーバーは `.mcp.json` を参照（eagle / supabase-local / storybook / supabase / context7 / sentry / playwright / github / vercel）。有効化は各自の `.claude/settings.local.json`（gitignore 対象＝ローカル専用）の `enabledMcpjsonServers` で対象を列挙して行う。

認証方式はサーバーごとに 2 通り（#1142 → 2026-06-16 整理）:

1. **OAuth 承認方式**（`/mcp` で承認、トークン管理不要）: `sentry` / `vercel`。`sentry` は `https://mcp.sentry.dev/mcp` を直叩きする hosted MCP。
2. **`.mcp.json` 内 `op run` 自己解決方式**: `supabase`(cloud) / `github`。MCP プロセスの起動コマンド自体を `op run -- <bin>` でラップし、spawn 時に 1Password が `op://` 参照を解決する。**Claude 本体の起動経路に依存しない**（desktop アプリ起動でも動く）。token 系 MCP はこの方式を標準とする。

**トークンを平文でハードコードしない**。env 注入を要する MCP はもう無いため、**Claude 起動に zsh の `op run` ラッパーは不要**（過去の `.op-env.mcp` / wrapper 方式は廃止）。前提は `op` CLI + 1Password desktop 統合が使えること。`op run` は stdout / stderr の secret masking が既定で有効なので、MCP server へ env token を渡す用途では `--no-masking` を付けない。

## 運用方針

- **常時使う**: `context7` / `sentry` / `github` / `vercel`
- **オンデマンドで使う**: `eagle` / `supabase-local` / `storybook` / `supabase`(cloud)
- `context7` はバージョン依存の判断では原則使う。Next.js 15 / React 19 / tRPC / Supabase client / TanStack Query / Zustand などは記憶だけで判断しない。
- `sentry` / `vercel` は OAuth 方式。初回や期限切れ時に `/mcp` で承認する。token 管理は不要。
- `supabase`(cloud) / `github` は `.mcp.json` の起動コマンドが `op run` で `op://` を自己解決する。zsh ラッパー起動に依存しない。token は repo に置かない。
- `supabase`(cloud) は production project（read-only 既定）を参照する。schema/RLS の確認用。書き込みを伴う migration は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。
- `supabase-local` は migration / RLS / schema 確認時だけ Docker Desktop と `supabase start` を起動する。通常のレビュー・実装ではローカル DB が落ちていても異常扱いしない。
- `eagle` はローカル Eagle app が起動している時だけ使う。Eagle app が落ちている場合は MCP 接続失敗を異常扱いしない。
- `~/.claude/settings.json` に残る未定義 MCP 権限（例: `lighthouse`）は過去の許可履歴として扱い、必要になった時に別途棚卸しする。`storybook` は公式アドオン方式で `.mcp.json` に正式登録済み（過去の third-party `storybook-mcp` 履歴とは別物）。

## 接続済み MCP サーバー

### Sentry (`mcp__sentry__*`)

- **Invoke when**:
  - ユーザーがエラーや予期しない挙動を報告したら、再現手順を聞く前にまず `list_issues` / `list_events` で該当イベントを検索する
  - デプロイ直後の不具合調査時は `find_releases` で最新リリースのエラー増加を確認する
  - スタックトレースから原因が曖昧なとき `analyze_issue_with_seer` で一次切り分けを行う
- **Before use**:
  - **OAuth 承認方式**（2026-06-16 移行）。`.mcp.json` の `sentry` は hosted MCP `https://mcp.sentry.dev/mcp` を直叩きする。トークン注入・env 変数は不要。
  - 未承認 / 期限切れなら `/mcp` で `sentry` を承認する（github / vercel と同じフロー）。承認後の OAuth トークンは Claude 側にキャッシュされ、desktop アプリ起動・zsh ターミナル起動のどちらでも動く。
  - 疎通確認は `whoami` または `find_organizations`（`dayopt` org が返れば OK。OAuth ではログインユーザー権限で org/project が見えるため、旧 integration token 時代の「`find_organizations` が `[]`」制約は解消）。
- **`Authorization Expired` / 401 が出たら**: `/mcp` で `sentry` を再承認する。OAuth トークンの失効サイン。env トークン (`SENTRY_ACCESS_TOKEN`) 注入経路はもう使わない（hosted OAuth へ移行済み）。
- **フォールバック**: MCP が通らない間は Sentry Web UI / `sentry-cli` を使う。
- **境界ケース**: 「再現できますか？」とユーザーに尋ねる前に Sentry で対象 issue を探す。ヒットすればスタックトレースから直接原因を特定できるので、ユーザーの手間を省ける。

### Supabase（`supabase-local`=ローカル / `supabase`=cloud）

2 サーバーを使い分ける。**ローカル DB の inspect は `supabase-local`、production schema の確認は `supabase`(cloud, read-only)**。

- **Invoke when（`supabase-local`）**:
  - schema / RLS / migration を編集する前に、現在のスキーマ状態を取得して差分を確認する
  - `supabase/migrations/` に新 SQL を追加する前にローカル DB の既存テーブル・ポリシーを inspect する
  - Realtime 購読や RLS 挙動のデバッグ時に実データで挙動を確認する
- **Invoke when（`supabase` cloud）**:
  - production の実 schema / RLS / advisors を確認したい時（`list_tables` / `get_advisors`）
  - ローカルを起動せずに本番テーブル構成を素早く参照したい時
- **Before use**:
  - `supabase-local`: Docker Desktop 起動後に `npx supabase status`、`nc -vz 127.0.0.1 54321` で待ち受け確認。`list_tables` が通れば利用可
  - `supabase`(cloud): `.mcp.json` の起動コマンドが `op run -- npx ...` でラップされ、spawn 時に `op://Dayopt-Staging/supabase/SUPABASE_ACCESS_TOKEN` を自己解決する（zsh ラッパー起動に依存しない）。`op` CLI + 1Password desktop 統合が前提。`list_tables` で疎通確認。失敗時は 1Password 未起動 or `op` が PATH に無いことを疑う
- **絶対ルール**: `supabase`(cloud) は `.mcp.json` で `--read-only` + `--project-ref=yvglwblxrnrenfifsnje`（production）に固定。**cloud 経由で書き込み・migration はしない**。schema 変更は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。
- **境界ケース**: `pnpm types:generate` を走らせる前に、スキーマ変更が DB に反映済みか確認する（未反映だと型生成しても差分が出ない）。現在は単一 project 運用のため dev / preview / production すべて同じ Production project を参照する。

### Vercel (`mcp__vercel__*`)

- **Invoke when**:
  - デプロイ直後にビルド/デプロイ状態や preview URL を確認する時（`list_deployments` / `get_deployment`）
  - 本番・preview の runtime ログ調査時（`get_runtime_logs`）。Sentry と合わせて一次切り分けに使う
  - プロジェクト設定や環境変数の構成を確認する時（`list_projects` / `get_project`）
- **Before use**:
  - OAuth 方式（`https://mcp.vercel.com`）。未承認 / 期限切れなら `/mcp` で承認する。token 管理は不要
  - 疎通は `list_projects` で確認する
- **境界ケース**: 単純な単一 API 取得は `vercel` CLI（`vercel api ...`）で十分。デプロイ横断の状態確認やログ調査で MCP を使う。

### Context7 (`mcp__context7__*`)

- **Invoke when**:
  - Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などバージョン固有挙動が問題になりうるライブラリ API を扱う時
  - エラーメッセージが最新ドキュメントの API シグネチャと一致しているか確認したい時
  - 新規依存追加を検討する際、最新の推奨 API 設計を確認する時
- **Before use**:
  - CLI 側の生存確認は `npx -y @upstash/context7-mcp@latest --version` で行う
  - Claude MCP 経由では `resolve-library-id` から `query-docs` の順に確認する
- **境界ケース**: 「知っている」と思っても、Next.js 15 App Router や React 19 の新 hook など cutoff 付近のトピックは必ず `query-docs` で確認してから回答する。

### Eagle (`mcp__eagle__*`)

- **Invoke when**:
  - Storybook スナップショットを Eagle に同期する時（`eagle-dayopt` skill の領域）
  - デザインアセットの検索、タグ整理、Archive 管理を行う時
  - Figma 由来の参考デザインをローカルで横断検索したい時
- **Before use**:
  - `nc -vz 127.0.0.1 41596` で Eagle app 側の待ち受けを確認する
  - `GET http://127.0.0.1:41596/mcp` が `405 Method Not Allowed` を返せば endpoint は生存している
- **境界ケース**: スクリーンショット撮影は「タグごと」に行うルール（push ごとではない）。詳細は `eagle-dayopt` skill に従う。

### Playwright (`mcp__playwright__*`)

- **Invoke when**:
  - UI 変更実装後、Stats ページ / Hero / block-visual 等のビジュアル結果をスクリーンショットで確認する
  - E2E スモーク（`apps/product` / `apps/web` の `playwright.config.ts`）が失敗した際の再現状況を撮影する
  - Storybook の variant レンダリングを検証する
- **Before use**:
  - 検証対象（`pnpm storybook` の localhost:6006、または `pnpm dev` の app）が起動していることを確認する
  - 初回は `@playwright/mcp` がブラウザバイナリを取得するため、`browser_navigate` の初回呼び出しが遅延しうる
- **境界ケース**: 「型チェック・lint は通った」だけで完了報告しない。UI 変更は Playwright スクリーンショットで視覚確認するまでが完了。

### Storybook (`mcp__storybook__*`)

公式アドオン `@storybook/addon-mcp`（`apps/storybook/.storybook/main.ts` に登録、toolsets: dev/docs）が Storybook dev サーバー上に MCP を公開する（`http://localhost:6006/mcp`）。

- **Invoke when**:
  - component の props / variant / story 構成をコードを離れず把握したい時（`get-storybook-story-instructions`）
  - 既存 story のレンダリングをプレビューで確認する時（`preview-stories`）
  - design system の docs / MDX を横断参照する時（`list-all-documentation` / `get-documentation`）
- **Before use**:
  - `pnpm storybook`（localhost:6006）が起動していることを確認する（`nc -z localhost 6006`）。トークンは不要
  - Storybook が落ちている場合は MCP 接続失敗を異常扱いしない（eagle / supabase-local と同じオンデマンド運用）
- **境界ケース**: 視覚的な regression 確認は Playwright スクリーンショットの領域。Storybook MCP は props / story 構成 / docs の「構造化知識」取得に使い、見た目の検証には使わない。

### GitHub (`mcp__github__*`)

- **Invoke when**:
  - ユーザーが PR / issue / commit を番号や URL で参照したら、本文をペーストしてもらう前に MCP で取得する
  - リリースノート作成時にマージ済み PR 一覧を構造化データで取得する
  - 複数 PR や issue の横断集計を行う時
- **Before use**:
  - **stdio + op run 自己解決方式**（2026-06-16 移行）。`.mcp.json` の `github` は `op run -- github-mcp-server stdio` を起動し、spawn 時に `op://Dayopt-Shared/github-mcp-pat/credential`（PAT）を `GITHUB_PERSONAL_ACCESS_TOKEN` に解決する。zsh ラッパー起動に依存しない。
  - 前提: 公式バイナリ `github-mcp-server`（`brew install github-mcp-server`）+ `op` CLI + 1Password desktop 統合。`claude mcp get github` が `✔ Connected` なら利用可。
  - GitHub の remote MCP (`api.githubcopilot.com`) は OAuth(DCR) 非対応のため OAuth 方式は使えない（#1142 で確認、2026-06 時点でも未対応）。ローカル stdio 版 + op run がトークン管理を repo に漏らさない最善手。
- **境界ケース**: 単純な単一取得（`gh pr view N`）は `gh` CLI で十分。構造化抽出や横断集計が必要なときに MCP を使う。

## 共通原則

1. **推測より確認**: 「たぶん X」と答える前に MCP で裏を取れるか検討する
2. **ユーザーの手間を減らす**: URL・ID が提示されたら、本文ペーストを求める前に MCP で取得する
3. **デプロイ後の能動チェック**: 本番デプロイ直後は Sentry でエラー増加を自発的に確認する
