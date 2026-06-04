# MCP サーバー利用ガイドライン

Opus 4.7 はツール呼び出しが控えめになる傾向がある。以下の場面では積極的に MCP を呼ぶこと。推測より確認を優先する。

接続済みサーバーは `.mcp.json` を参照（eagle / supabase-local / context7 / sentry / playwright / github）。`enabledMcpjsonServers` を `.claude/settings.local.json` に設定している場合は、追加した playwright / github も忘れず有効化する。

## 運用方針

- **常時使う**: `context7` / `sentry`
- **オンデマンドで使う**: `eagle` / `supabase-local`
- `context7` はバージョン依存の判断では原則使う。Next.js 15 / React 19 / tRPC / Supabase client / TanStack Query / Zustand などは記憶だけで判断しない。
- `sentry` は `SENTRY_ACCESS_TOKEN` を Claude 起動環境から渡す。`sentry-mcp auth login` の device cache には依存しない。token は repo に置かず、1Password / shell env / Claude 起動ラッパー側で管理する。
- `supabase-local` は migration / RLS / schema 確認時だけ Docker Desktop と `supabase start` を起動する。通常のレビュー・実装ではローカル DB が落ちていても異常扱いしない。
- `eagle` はローカル Eagle app が起動している時だけ使う。Eagle app が落ちている場合は MCP 接続失敗を異常扱いしない。
- `~/.claude/settings.json` に残る未定義 MCP 権限（例: `storybook-mcp` / `lighthouse`）は過去の許可履歴として扱い、必要になった時に別途棚卸しする。

## 接続済み MCP サーバー

### Sentry (`mcp__sentry__*`)

- **Invoke when**:
  - ユーザーがエラーや予期しない挙動を報告したら、再現手順を聞く前にまず `list_issues` / `list_events` で該当イベントを検索する
  - デプロイ直後の不具合調査時は `find_releases` で最新リリースのエラー増加を確認する
  - スタックトレースから原因が曖昧なとき `analyze_issue_with_seer` で一次切り分けを行う
- **Before use**:
  - Claude 起動環境で `SENTRY_ACCESS_TOKEN` が空でないことを確認する
  - 疎通確認は `auth status` ではなく、MCP tool の `whoami` または `find_organizations` で行う
- **境界ケース**: 「再現できますか？」とユーザーに尋ねる前に Sentry で対象 issue を探す。ヒットすればスタックトレースから直接原因を特定できるので、ユーザーの手間を省ける。

### Supabase (`supabase-local` / HTTP)

- **Invoke when**:
  - schema / RLS / migration を編集する前に、現在のスキーマ状態を取得して差分を確認する
  - `supabase/migrations/` に新 SQL を追加する前にローカル DB の既存テーブル・ポリシーを inspect する
  - Realtime 購読や RLS 挙動のデバッグ時に実データで挙動を確認する
- **Before use**:
  - Docker Desktop 起動後に `npx supabase status` で前提状態を確認する
  - `nc -vz 127.0.0.1 54321` で HTTP endpoint の待ち受けを確認する
  - MCP tool の `list_tables` が通れば利用可能と判断する
- **境界ケース**: `pnpm types:generate` を走らせる前に、MCP でスキーマ変更が DB に反映済みか確認する（未反映だと型生成しても差分が出ない）。現在は単一 project 運用のため dev / preview / production すべて同じ Production project を参照する。

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

### GitHub (`mcp__github__*`)

- **Invoke when**:
  - ユーザーが PR / issue / commit を番号や URL で参照したら、本文をペーストしてもらう前に MCP で取得する
  - リリースノート作成時にマージ済み PR 一覧を構造化データで取得する
  - 複数 PR や issue の横断集計を行う時
- **Before use**:
  - 初回は OAuth 承認（`/mcp` で承認フロー）が必要。token は repo に置かない
- **境界ケース**: 単純な単一取得（`gh pr view N`）は `gh` CLI で十分。構造化抽出や横断集計が必要なときに MCP を使う。

## 共通原則

1. **推測より確認**: 「たぶん X」と答える前に MCP で裏を取れるか検討する
2. **ユーザーの手間を減らす**: URL・ID が提示されたら、本文ペーストを求める前に MCP で取得する
3. **デプロイ後の能動チェック**: 本番デプロイ直後は Sentry でエラー増加を自発的に確認する
