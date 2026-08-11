# MCP サーバー利用ガイドライン

モデルによってはツール呼び出しが控えめになる傾向がある。モデルによらず、以下の場面では積極的に MCP を呼ぶこと。推測より確認を優先する。

MCP サーバーの定義は **global 設定に一本化する**（`~/.claude.json` の user scope `mcpServers`）。**repo 側に MCP 定義を置かない**。repo と global の両方に同名サーバーがあるとキー単位でマージされ、方式が食い違うと壊れる（2026-07-23 に repo 定義を撤去。経緯は [2026-07-23-mcp-global-consolidation.md](../../docs/engineering/log/2026-07-23-mcp-global-consolidation.md)）。

全 10 サーバーの登録内容。新しいマシンではこの表を元に global へ登録する:

| Server             | 種別                 | 登録内容                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eagle`            | http                 | `http://127.0.0.1:41596/mcp`                                                                                                                                                                                                                                                  |
| `supabase-local`   | http                 | `http://127.0.0.1:54321/mcp`                                                                                                                                                                                                                                                  |
| `storybook`        | http                 | `http://localhost:6006/mcp`                                                                                                                                                                                                                                                   |
| `sentry`           | http (OAuth)         | `https://mcp.sentry.dev/mcp`                                                                                                                                                                                                                                                  |
| `vercel`           | http (OAuth)         | `https://mcp.vercel.com`                                                                                                                                                                                                                                                      |
| `context7`         | stdio                | `npx -y @upstash/context7-mcp@latest`                                                                                                                                                                                                                                         |
| `playwright`       | stdio                | `npx -y @playwright/mcp@latest`                                                                                                                                                                                                                                               |
| `supabase` (cloud) | stdio                | **常駐登録しない**（使う時だけ登録。下記 §`supabase`(cloud) はオンデマンド登録する）。`op run -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=yvglwblxrnrenfifsnje` / env `SUPABASE_ACCESS_TOKEN=op://Dayopt-Staging/supabase/SUPABASE_ACCESS_TOKEN` |
| `github`           | stdio                | `op run -- github-mcp-server stdio` / env `GITHUB_PERSONAL_ACCESS_TOKEN=op://Dayopt-Shared/github-mcp-pat/credential`                                                                                                                                                         |
| `uptimerobot`      | http (headersHelper) | **常駐登録しない**（使う時だけ登録。下記 §`uptimerobot` はオンデマンド登録する）。`https://mcp.uptimerobot.com/mcp` / `headersHelper: ~/.claude/scripts/uptimerobot-headers.sh`（spawn 時に 1Password の Read-only API Key を解決）                                           |

認証方式はサーバーごとに 3 通り（#1142 → 2026-06-16 整理、#1758 で headersHelper 方式を追加）:

1. **OAuth 承認方式**（`/mcp` で承認、トークン管理不要）: `sentry` / `vercel`。`sentry` は `https://mcp.sentry.dev/mcp` を直叩きする hosted MCP。
2. **global 設定内 `op run` 自己解決方式**: `supabase`(cloud) / `github`。MCP プロセスの起動コマンド自体を `op run -- <bin>` でラップし、spawn 時に 1Password が `op://` 参照を解決する。**Claude 本体の起動経路に依存しない**（desktop アプリ起動でも動く）。stdio の token 系 MCP はこの方式を標準とする。
3. **`headersHelper` 方式**（remote http + Bearer token）: `uptimerobot`。設定の `headersHelper` に指定した script を接続時に実行し、stdout の JSON を認証ヘッダーとして使う（Claude Code 2.1.193+）。script 内で `op read` するため設定ファイルに token の平文が残らない。remote http で OAuth の read-only scope が保証されないサーバーはこの方式を使う。

**`op run` 方式のサーバーは常駐登録を 1 つに保つ。** spawn ごとに 1Password の承認が要求されるため、常駐登録が N 個あるとロック状態からの起動時に承認が N 回出る。常時使う `github` だけを常駐させ、それ以外はオンデマンド登録にする（2026-07-31、承認が 2 回出ていた実測に基づく）。

**トークンを平文でハードコードしない**。env 注入を要する MCP はもう無いため、**Claude 起動に zsh の `op run` ラッパーは不要**（過去の `.op-env.mcp` / wrapper 方式は廃止）。前提は `op` CLI + 1Password desktop 統合が使えること。`op run` は stdout / stderr の secret masking が既定で有効なので、MCP server へ env token を渡す用途では `--no-masking` を付けない。

## 運用方針

- **常時使う**: `context7` / `sentry` / `github` / `vercel`
- **オンデマンドで使う**: `eagle` / `supabase-local` / `storybook` / `supabase`(cloud) / `uptimerobot`
- `context7` はバージョン依存の判断では原則使う。Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などはmanifestでexact versionを確認し、記憶だけで判断しない。
- `sentry` / `vercel` は OAuth 方式。初回や期限切れ時に `/mcp` で承認する。token 管理は不要。
- `supabase`(cloud) / `github` は global 設定の起動コマンドが `op run` で `op://` を自己解決する。zsh ラッパー起動に依存しない。token は repo に置かない。
- `supabase`(cloud) は production project（read-only 既定）を参照する。schema/RLS の確認用。書き込みを伴う migration は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。
- `supabase-local` は migration / RLS / schema 確認時だけ Docker Desktop と `supabase start` を起動する。通常のレビュー・実装ではローカル DB が落ちていても異常扱いしない。
- `eagle` はローカル Eagle app が起動している時だけ使う。Eagle app が落ちている場合は MCP 接続失敗を異常扱いしない。
- `~/.claude/settings.json` に残る未定義 MCP 権限（例: `lighthouse`）は過去の許可履歴として扱い、必要になった時に別途棚卸しする。`storybook` は公式アドオン方式で global 設定に正式登録済み（過去の third-party `storybook-mcp` 履歴とは別物）。

### `supabase`(cloud) はオンデマンド登録する

`op run` 方式のため、常駐させるとセッション起動ごとに 1Password 承認が 1 回増える。production schema を実際に見る時だけ登録し、終わったら外す。

```bash
# 使う時
claude mcp add supabase -s user -- op run -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=yvglwblxrnrenfifsnje

# 使い終わったら
claude mcp remove supabase -s user
```

登録後は再起動して `list_tables` で疎通確認する。`supabase-local`（http、`op` 不要）は常駐のままでよい。

### `uptimerobot` はオンデマンド登録する

headersHelper が接続のたびに `op read` を実行するため、常駐させるとセッション起動ごとに 1Password 承認が 1 回増える（`op run` 常駐を 1 つに保つのと同じ理由）。障害調査で外形監視の状態を見る時だけ登録し、終わったら外す。

```bash
# 使う時
claude mcp add-json uptimerobot "{\"type\":\"http\",\"url\":\"https://mcp.uptimerobot.com/mcp\",\"headersHelper\":\"$HOME/.claude/scripts/uptimerobot-headers.sh\"}" -s user

# 使い終わったら
claude mcp remove uptimerobot -s user
```

前提: `~/.claude/scripts/uptimerobot-headers.sh`（repo 外の user-global script）が存在すること。中身は `op read "op://Dayopt-Shared/<item-id>/credential"` で **Read-only API Key** を取り出し `{"Authorization": "Bearer <token>"}` を echo するだけ。新しいマシンでは 1Password の item `UptimeRobot Read-only API Key`（Dayopt-Shared）を参照して script を作り直す。

## 接続済み MCP サーバー

### Sentry (`mcp__sentry__*`)

- **Invoke when**:
  - ユーザーがエラーや予期しない挙動を報告したら、再現手順を聞く前にまず `list_issues` / `list_events` で該当イベントを検索する
  - デプロイ直後の不具合調査時は `find_releases` で最新リリースのエラー増加を確認する
  - スタックトレースから原因が曖昧なとき `analyze_issue_with_seer` で一次切り分けを行う
- **Before use**:
  - **OAuth 承認方式**（2026-06-16 移行）。`sentry` は hosted MCP `https://mcp.sentry.dev/mcp` を直叩きする。トークン注入・env 変数は不要。旧 `npx @sentry/mcp-server` + `SENTRY_ACCESS_TOKEN` 方式は廃止済みで、repo にこの定義を復活させると global の url 定義とマージされて `url is not supported for stdio` で MCP 全体が起動しなくなる。
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
  - `supabase`(cloud): **既定では登録されていない**。§`supabase`(cloud) はオンデマンド登録する の `claude mcp add` で登録し、再起動してから使う。起動コマンドが `op run -- npx ...` でラップされ、spawn 時に `op://Dayopt-Staging/supabase/SUPABASE_ACCESS_TOKEN` を自己解決する（zsh ラッパー起動に依存しない）。`op` CLI + 1Password desktop 統合が前提。`list_tables` で疎通確認。失敗時は 1Password 未起動 or `op` が PATH に無いことを疑う
- **絶対ルール**: `supabase`(cloud) は global 設定で `--read-only` + `--project-ref=yvglwblxrnrenfifsnje`（production）に固定。**cloud 経由で書き込み・migration はしない**。schema 変更は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。Management API を MCP 経由でなく直叩きする場合は、レスポンス全文を表示せず `docs/operations/secrets.md` §API 経由の設定読戻し の jq 射影規則に従う。
- **境界ケース**: `pnpm types:generate` を走らせる前に、スキーマ変更が DB に反映済みか確認する（未反映だと型生成しても差分が出ない）。現在は単一 project 運用のため dev / preview / production すべて同じ Production project を参照する。

### Vercel (`mcp__vercel__*`)

- **Invoke when**:
  - デプロイ直後にビルド/デプロイ状態や preview URL を確認する時（`list_deployments` / `get_deployment`）
  - 本番・preview の runtime ログ調査時（`get_runtime_logs`）。Sentry と合わせて一次切り分けに使う
  - プロジェクト設定や環境変数の構成を確認する時（`list_projects` / `get_project`）
- **Before use**:
  - OAuth 方式（`https://mcp.vercel.com`）。未承認 / 期限切れなら `/mcp` で承認する。token 管理は不要
  - 疎通は `list_projects` で確認する
- **境界ケース**: 単純な単一 API 取得は `vercel` CLI（`vercel api ...`）で十分。デプロイ横断の状態確認やログ調査で MCP を使う。env 系エンドポイント（`/v10/projects/{project}/env` 等）のレスポンスは `value` に実値を含むため、全文を表示せず `docs/operations/secrets.md` §API 経由の設定読戻し の jq 射影規則に従う。

### Context7 (`mcp__context7__*`)

- **Invoke when**:
  - Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などバージョン固有挙動が問題になりうるライブラリ API を扱う時
  - エラーメッセージが最新ドキュメントの API シグネチャと一致しているか確認したい時
  - 新規依存追加を検討する際、最新の推奨 API 設計を確認する時
- **Before use**:
  - CLI 側の生存確認は `npx -y @upstash/context7-mcp@latest --version` で行う
  - Claude MCP 経由では `resolve-library-id` から `query-docs` の順に確認する
- **境界ケース**: 「知っている」と思っても、current Next.js App RouterやReactの新hookなどversion依存のトピックは必ずmanifestを確認し、`query-docs`で一次資料を確認してから回答する。

### Eagle (`mcp__eagle__*`)

Eagle は「目で見て判断する素材」の視覚検索ライブラリ。何を入れて何を入れないかの規約は [tooling.md 第1部](../../docs/operations/tooling.md#第1部-eagle-デザインアセット運用) を正とする。

- **Invoke when**:
  - UI 設計・改善で参考事例を探す時（`ai_search_by_text` でセマンティック検索、`item_query` でタグ・★絞り込み）
  - font / icon / illust などの作業用素材を探す時
  - 過去のブランドクリエイティブ（OGP / SNS / Product Hunt 用画像）と、その出所・掲載先を確認する時
  - 参考として採用したアイテムに ★ と pattern タグを付けて curate する時
  - フォルダ・タググループを整備する時（`folder_create` / `tag_group_create`）
- **Before use**:
  - `nc -vz 127.0.0.1 41596` で Eagle app 側の待ち受けを確認する
  - MCP tool の直接呼び出しは `POST http://127.0.0.1:41596/api/tools/call` に `{"tool": "...", "params": {...}}`。**引数キーは `params`**。`arguments` など他のキーは検証を通らず黙って無視され、全件返却などの誤った結果になる
  - 利用可能な tool と入力スキーマは `GET http://127.0.0.1:41596/api/tools/list` が正。ドキュメントや過去のコードに載っていても存在しない tool がある（例: `smart_folder_*` はこのビルドに無い。スマートフォルダは Eagle アプリで手作業）
  - `item_get` の `limit` 既定は全件。ページングは `limit` + `offset`
  - `ai_search_status` の `totalSyncedItems` で AI 検索インデックスを確認する。未構築だと `ai_search_by_text` はエラーになる。構築は Eagle アプリの AI Search プラグイン画面から行う
  - `item_query` はタグ・annotation を対象とし、**ファイル名では検索できない**。名前で絞るなら `item_get` + クライアント側フィルタ
- **境界ケース**:
  - **実装の見た目を確認したい時は Eagle を開かない。** Storybook 本体（視覚）と Storybook MCP（構造化情報）が正。Eagle に実装スナップショットは置かない
  - 大量の raw 参考 UI に一括タグ付け・一括フォルダ移動をしない。横断検索は AI 検索、アプリ別閲覧はスマートフォルダで元データ無変更のまま行う
  - ライブラリのアイテムを削除・trash 移動しない。処分はユーザーの判断領域

### Playwright (`mcp__playwright__*`)

- **Invoke when**:
  - 同じ操作を反復できる形で検証する必要がある時、または複数 viewport / variant のスクリーンショット比較を行う時
  - E2E スモーク（`apps/product/playwright.config.ts`）が失敗した際の再現状況を撮影する
  - 共有 browser surface が利用できず、独立した browser で視覚 evidence を取得する必要がある時
- **Before use**:
  - 検証対象（`pnpm storybook` の localhost:6006、または `pnpm dev` の app）が起動していることを確認する
  - 初回は `@playwright/mcp` がブラウザバイナリを取得するため、`browser_navigate` の初回呼び出しが遅延しうる
- **境界ケース**:
  - 「型チェック・lint は通った」だけで完了報告しない。UI 変更は provider の共有 browser、Preview、または Playwright のいずれかで視覚確認する
  - 既存の共有 browser で単発の視覚確認を完了できる時は、同じ evidence のために独立 Playwright browser を追加で起動しない

### Storybook (`mcp__storybook__*`)

公式アドオン `@storybook/addon-mcp`（`apps/storybook/.storybook/main.ts` に登録、toolsets: dev/docs）が Storybook dev サーバー上に MCP を公開する（`http://localhost:6006/mcp`）。

- **Invoke when**:
  - component の props / variant / story 構成をコードを離れず把握したい時（`get-storybook-story-instructions`）
  - 既存 story のレンダリングをプレビューで確認する時（`preview-stories`）
  - design system の docs / MDX を横断参照する時（`list-all-documentation` / `get-documentation`）
- **Before use**:
  - `pnpm storybook`（localhost:6006）が起動していることを確認する（`nc -z localhost 6006`）。トークンは不要
  - Storybook が落ちている場合は MCP 接続失敗を異常扱いしない（eagle / supabase-local と同じオンデマンド運用）
- **境界ケース**: Storybook MCP は props / story 構成 / docs の「構造化知識」取得に使い、見た目の検証には使わない。視覚確認は共有 browser surface を優先し、反復可能な自動回帰確認が必要な時だけ Playwright を使う。

### GitHub (`mcp__github__*`)

- **Invoke when**:
  - ユーザーが PR / issue / commit を番号や URL で参照したら、本文をペーストしてもらう前に MCP で取得する
  - リリースノート作成時にマージ済み PR 一覧を構造化データで取得する
  - 複数 PR や issue の横断集計を行う時
- **Before use**:
  - **stdio + op run 自己解決方式**（2026-06-16 移行）。global 設定の `github` は `op run -- github-mcp-server stdio` を起動し、spawn 時に `op://Dayopt-Shared/github-mcp-pat/credential`（PAT）を `GITHUB_PERSONAL_ACCESS_TOKEN` に解決する。zsh ラッパー起動に依存しない。
  - 前提: 公式バイナリ `github-mcp-server`（`brew install github-mcp-server`）+ `op` CLI + 1Password desktop 統合。`claude mcp get github` が `✔ Connected` なら利用可。
  - GitHub の remote MCP (`api.githubcopilot.com`) は OAuth(DCR) 非対応のため OAuth 方式は使えない（#1142 で確認、2026-06 時点でも未対応）。ローカル stdio 版 + op run がトークン管理を repo に漏らさない最善手。
- **境界ケース**: 単純な単一取得（`gh pr view N`）は `gh` CLI で十分。構造化抽出や横断集計が必要なときに MCP を使う。

### UptimeRobot (`mcp__uptimerobot__*`)

外形監視（`https://app.dayopt.app/api/health` の HTTP monitor、#1426 で設定）の調査経路。**Read-only API Key で接続するため read 系 tool（`list-monitors` / `list-incidents` / `get-monitor-stats` / `get-response-times` 等 17 個）しか公開されず、monitor の作成・変更・pause は構造的に不可能**（2026-08-05 実測）。

- **役割分担**: alert の一次通知は既存メール（変わらない）。障害調査・横断要約が MCP。app 内部 error は Sentry、deployment / function は Vercel。確認順は「Sentry → UptimeRobot → Vercel」
- **Invoke when**:
  - ユーザーが障害・ダウンタイムを報告した時、または UptimeRobot のメール alert を受けた後の一次切り分けで、現在状態・直近 incident・uptime・response time を確認する
  - 「外形監視の状態を確認して」「先週の uptime は」等の明示依頼
- **Before use**:
  - **既定では登録されていない**。§`uptimerobot` はオンデマンド登録する の `claude mcp add-json` で登録し、再起動してから使う。起動時に headersHelper が `op read` を実行するため 1Password の承認が 1 回出る
  - 疎通確認は `list-monitors`（monitor `Dayopt app health` が返れば OK）
- **401 / 接続失敗時**: 1Password 未起動・ロック中を疑う（headersHelper は 401 で自動リトライする）。次に 1Password 側の item / Read-only API Key の失効を確認する
- **フォールバック**: UptimeRobot dashboard（Web UI）とメール通知。MCP が使えなくても Production 監視自体には影響しない
- **境界ケース**: rate limit は account の API と共有（Free plan 10 req/min、rolling 60 秒）。MCP の自然言語出力を根拠に監視設定を変更しない。write が必要になったら別 issue で設計する（このサーバーの scope 外）

## 共通原則

1. **推測より確認**: 「たぶん X」と答える前に MCP で裏を取れるか検討する
2. **ユーザーの手間を減らす**: URL・ID が提示されたら、本文ペーストを求める前に MCP で取得する
3. **デプロイ後の能動チェック**: 本番デプロイ直後は Sentry でエラー増加を自発的に確認する
