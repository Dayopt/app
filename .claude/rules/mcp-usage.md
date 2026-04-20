# MCP サーバー利用ガイドライン

Opus 4.7 はツール呼び出しが控えめになる傾向がある。以下の場面では積極的に MCP を呼ぶこと。推測より確認を優先する。

接続済みサーバーは `.mcp.json` を参照（eagle / supabase-local / context7 / sentry）。Playwright / GitHub は未接続だが将来追加を想定して方針のみ記載する。

## 接続済み MCP サーバー

### Sentry (`mcp__sentry__*`)

- **Invoke when**:
  - ユーザーがエラーや予期しない挙動を報告したら、再現手順を聞く前にまず `list_issues` / `list_events` で該当イベントを検索する
  - デプロイ直後の不具合調査時は `find_releases` で最新リリースのエラー増加を確認する
  - スタックトレースから原因が曖昧なとき `analyze_issue_with_seer` で一次切り分けを行う
- **境界ケース**: 「再現できますか？」とユーザーに尋ねる前に Sentry で対象 issue を探す。ヒットすればスタックトレースから直接原因を特定できるので、ユーザーの手間を省ける。

### Supabase (`supabase-local` / HTTP)

- **Invoke when**:
  - schema / RLS / migration を編集する前に、現在のスキーマ状態を取得して差分を確認する
  - `supabase/migrations/` に新 SQL を追加する前にローカル DB の既存テーブル・ポリシーを inspect する
  - Realtime 購読や RLS 挙動のデバッグ時に実データで挙動を確認する
- **境界ケース**: `npm run types:generate:staging` を走らせる前に、MCP でスキーマ変更が DB に反映済みか確認する（未反映だと型生成しても差分が出ない）。※ 新運用モデル（1 project + branches）では日常 types 生成の対象は preview branch。script 名が `staging` のままなのは package.json 再設計までの過渡状態なので、コマンド実行時は preview branch 向けに読み替える（follow-up issue）。

### Context7 (`mcp__context7__*`)

- **Invoke when**:
  - Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などバージョン固有挙動が問題になりうるライブラリ API を扱う時
  - エラーメッセージが最新ドキュメントの API シグネチャと一致しているか確認したい時
  - 新規依存追加を検討する際、最新の推奨 API 設計を確認する時
- **境界ケース**: 「知っている」と思っても、Next.js 15 App Router や React 19 の新 hook など cutoff 付近のトピックは必ず `query-docs` で確認してから回答する。

### Eagle (`mcp__eagle__*`)

- **Invoke when**:
  - Storybook スナップショットを Eagle に同期する時（`eagle-dayopt` skill の領域）
  - デザインアセットの検索、タグ整理、Archive 管理を行う時
  - Figma 由来の参考デザインをローカルで横断検索したい時
- **境界ケース**: スクリーンショット撮影は「タグごと」に行うルール（push ごとではない）。詳細は `eagle-dayopt` skill に従う。

## 未接続 MCP サーバー（将来追加予定）

### Playwright — Status: not yet connected

- **Invoke when** (接続後):
  - UI 変更実装後、Stats ページ / Hero / block-visual 等のビジュアル結果をスクリーンショットで確認する
  - E2E スモークが失敗した際の再現状況を撮影する
  - Storybook の variant レンダリングを検証する
- **境界ケース**: 「型チェック・lint は通った」だけで完了報告しない。UI 変更は Playwright スクリーンショットで視覚確認するまでが完了。

### GitHub — Status: not yet connected

- **Invoke when** (接続後):
  - ユーザーが PR / issue / commit を番号や URL で参照したら、本文をペーストしてもらう前に MCP で取得する
  - リリースノート作成時にマージ済み PR 一覧を構造化データで取得する
  - 複数 PR や issue の横断集計を行う時
- **境界ケース**: 単純な単一取得（`gh pr view N`）は `gh` CLI で十分。構造化抽出や横断集計が必要なときに MCP を使う。

## 共通原則

1. **推測より確認**: 「たぶん X」と答える前に MCP で裏を取れるか検討する
2. **ユーザーの手間を減らす**: URL・ID が提示されたら、本文ペーストを求める前に MCP で取得する
3. **デプロイ後の能動チェック**: 本番デプロイ直後は Sentry でエラー増加を自発的に確認する
