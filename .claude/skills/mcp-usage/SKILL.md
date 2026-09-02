---
name: mcp-usage
description: Sentry / Supabase(local・cloud) / Context7 / Eagle / Storybook / UptimeRobot の MCP と Vercel / GitHub の CLI-first 経路をいつ使うか判断する時に発動。Invoke when・認証方式（OAuth / op run 自己解決 / headersHelper / token不要）・登録手順・境界ケースを適用する。MCP 定義の追加・削除（global 設定変更）や通常の実装作業では発動しない。
---

# MCP サーバー利用ガイドライン

モデルによってはツール呼び出しが控えめになる傾向がある。モデルによらず、以下の場面では積極的に MCP を呼ぶこと。推測より確認を優先する。

MCP サーバーの定義は **global 設定に一本化する**（`~/.claude.json` の user scope `mcpServers`）。**repo 側に MCP 定義を置かない**。repo と global の両方に同名サーバーがあるとキー単位でマージされ、方式が食い違うと壊れる。

全 9 サーバーの登録内容。新しいマシンではこの表を元に global へ登録する:

| Server                    | 種別                 | 登録内容                                                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eagle`                   | http                 | `http://127.0.0.1:41596/mcp`                                                                                                                                                                                                                                                                            |
| `supabase-local`          | http                 | `http://127.0.0.1:54321/mcp`                                                                                                                                                                                                                                                                            |
| `storybook`               | http                 | `http://localhost:6006/mcp`                                                                                                                                                                                                                                                                             |
| `sentry`                  | http (OAuth)         | **常駐登録しない**（オンデマンド、下記 §Sentry）。`https://mcp.sentry.dev/mcp`                                                                                                                                                                                                                          |
| `vercel`                  | http (OAuth)         | **常駐登録しない**（CLI-first。下記 §Vercel）。登録が要る時だけ `https://mcp.vercel.com`                                                                                                                                                                                                                |
| `context7`                | stdio                | `npx -y @upstash/context7-mcp@latest`                                                                                                                                                                                                                                                                   |
| `supabase` (cloud)        | stdio                | **常駐登録しない**（使う時だけ登録。下記 §`supabase`(cloud) はオンデマンド登録する）。`op run -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=yvglwblxrnrenfifsnje` / env `SUPABASE_ACCESS_TOKEN=op://human/supabase-cli/SUPABASE_ACCESS_TOKEN`                                |
| `uptimerobot`             | http (headersHelper) | **常駐登録しない**（使う時だけ登録。下記 §`uptimerobot` はオンデマンド登録する）。`https://mcp.uptimerobot.com/mcp` / `headersHelper: ~/.claude/scripts/uptimerobot-headers.sh`（spawn 時に 1Password の Read-only API Key を解決）                                                                     |
| `usability-probe-browser` | stdio                | **常駐登録しない**（ユーザビリティプローブ実行時だけ登録。下記 §`usability-probe-browser` はオンデマンド登録する）。`npx -y @playwright/mcp@latest --storage-state=<storageState のパス> --allowed-origins=<probe 対象 origin>`。token 不要（`--storage-state` は事前生成したファイルへのローカルパス） |

認証方式はサーバーごとに 4 通り:

1. **OAuth 承認方式**（`/mcp` で承認、トークン管理不要）: `sentry` / `vercel`（いずれもオンデマンド登録）。`sentry` は `https://mcp.sentry.dev/mcp` を直叩きする hosted MCP。
2. **global 設定内 `op run` 自己解決方式**: `supabase`(cloud)。MCP プロセスの起動コマンド自体を `op run -- <bin>` でラップし、spawn 時に 1Password が `op://` 参照を解決する。**Claude 本体の起動経路に依存しない**（desktop アプリ起動でも動く）。stdio の token 系 MCP はこの方式を標準とする。
3. **`headersHelper` 方式**（remote http + Bearer token）: `uptimerobot`。設定の `headersHelper` に指定した script を接続時に実行し、stdout の JSON を認証ヘッダーとして使う。script 内で `op read` するため設定ファイルに token の平文が残らない。remote http で OAuth の read-only scope が保証されないサーバーはこの方式を使う。
4. **token 不要方式**（ローカルファイル引数のみ）: `usability-probe-browser`。認証情報は 1Password ではなく事前生成したローカルの storageState ファイルで、起動フラグにそのパスを渡すだけ。1Password / OAuth のいずれも介さない。

**`op run` 方式の常駐登録はゼロにする（`supabase`(cloud) はオンデマンド）。** spawn ごとに 1Password の承認が要求されるため、常駐登録が N 個あるとロック状態からの起動時に承認が N 回出る。

**トークンを平文でハードコードしない**。env 注入を要する MCP はもう無いため、Claude 起動に zsh の `op run` ラッパーは不要。前提は `op` CLI + 1Password desktop 統合が使えること。`op run` は stdout / stderr の secret masking が既定で有効なので、MCP server へ env token を渡す用途では `--no-masking` を付けない。

### claude.ai コネクタ方式は使わない

上記 3 方式とは別に、**claude.ai 自体の connector 設定画面**から MCP サーバーを接続する第 4 の経路が存在する。この経路は `~/.claude.json` の global `mcpServers` を経由せず、本ファイルのどのルール（`--read-only` 固定、`op run` によるオンデマンド登録、scope 制限）も通さずにセッションへツールを公開する。

**決定: claude.ai コネクタ方式は使わない。** 外部サービスへ新たに繋ぐ必要が出た場合も、この経路ではなく本ファイルが定める 3 方式（OAuth 承認 / `op run` 自己解決 / `headersHelper`）で global 設定へ登録する。理由は、read-only 固定や登録・解除のタイミングをこのファイルで inspect・強制できるのがこの 3 方式だけであるため。

## 運用方針

- **常時使う**: `context7` のみ
- **オンデマンド**: `sentry`（Seer 分析など CLI で閉じない時だけ） / `eagle` / `supabase-local` / `storybook` / `supabase`(cloud) / `uptimerobot` / `usability-probe-browser`
- **CLI-first（MCP を登録しない）**: Vercel（`vercel` CLI）、GitHub（`gh`）
- `context7` はバージョン依存の判断では原則使う。Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などはmanifestでexact versionを確認し、記憶だけで判断しない。
- `sentry` は通常 CLI（下記 §Sentry CLI）。Seer 分析や横断検索が要る時だけ `/mcp` で承認して MCP を使い、終わったら `claude mcp remove sentry -s user`。OAuth トークンはキャッシュされるため再登録は `/mcp` 承認 1 回で済む。
- `vercel` は MCP を常駐登録しない。デプロイ状態・build/runtime log・env 一覧は `vercel` CLI で閉じる（下記 §Vercel）。
- `supabase`(cloud) は global 設定の起動コマンドが `op run` で `op://` を自己解決する。zsh ラッパー起動に依存しない。token は repo に置かない。
- `supabase`(cloud) は production project（read-only 既定）を参照する。schema/RLS の確認用。書き込みを伴う migration は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。
- `supabase-local` は migration / RLS / schema 確認時だけ Docker Desktop と `supabase start` を起動する。通常のレビュー・実装ではローカル DB が落ちていても異常扱いしない。
- `eagle` はローカル Eagle app が起動している時だけ使う。Eagle app が落ちている場合は MCP 接続失敗を異常扱いしない。
- `storybook` は公式アドオン方式で global 設定に正式登録済み。

### 常駐を増やさない

**外部能力は、必要なものだけを、必要な瞬間だけ、最小の Context・権限・経路で渡す。常駐を 1 つ足すなら 1 つ外す、CLI で閉じるなら MCP を使わない、read-only を既定にする**（原則③、2026-09-02 決定）。

常駐 tool 数 × schema は毎ターンのプロンプトに載る。常駐を 1 つ足すなら 1 つ外す。単発 CLI で足りるものは MCP にしない（実施済み: `github` → `gh`、`playwright` → Browser tool）。ローカルアプリ依存（`eagle` / `storybook` / `supabase-local`）は常駐させない — 未起動時に毎セッション接続失敗のノイズを出すため。使う時だけ `claude mcp add`、終わったら `claude mcp remove`（登録内容は上の表が正本）。購入・停止・deploy など不可逆の能力を含む OAuth MCP（Vercel など）は常駐させない。read 用途は CLI で閉じる。

### `supabase`(cloud) はオンデマンド登録する

`op run` 方式のため、常駐させるとセッション起動ごとに 1Password 承認が 1 回増える。production schema を実際に見る時だけ登録し、終わったら外す。

```bash
# 使う時（-e で SUPABASE_ACCESS_TOKEN の op:// 参照を渡す。op run がこれを解決する）
claude mcp add supabase -s user -e SUPABASE_ACCESS_TOKEN=op://human/supabase-cli/SUPABASE_ACCESS_TOKEN -- op run -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=yvglwblxrnrenfifsnje

# 使い終わったら
claude mcp remove supabase -s user
```

登録後は再起動して `list_tables` で疎通確認する。`supabase-local`（http、`op` 不要）は常駐のままでよい。

### `uptimerobot` はオンデマンド登録する

headersHelper が接続のたびに `op read` を実行するため、常駐させるとセッション起動ごとに 1Password 承認が 1 回増える。障害調査で外形監視の状態を見る時だけ登録し、終わったら外す。

```bash
# 使う時
claude mcp add-json uptimerobot "{\"type\":\"http\",\"url\":\"https://mcp.uptimerobot.com/mcp\",\"headersHelper\":\"$HOME/.claude/scripts/uptimerobot-headers.sh\"}" -s user

# 使い終わったら
claude mcp remove uptimerobot -s user
```

前提: `~/.claude/scripts/uptimerobot-headers.sh`（repo 外の user-global script）が存在すること。中身は `op read "op://agent/<item-id>/credential"` で **Read-only API Key** を取り出し `{"Authorization": "Bearer <token>"}` を echo するだけ。新しいマシンでは 1Password の item `UptimeRobot Read-only API Key`（agent）を参照して script を作り直す。

### `usability-probe-browser` はオンデマンド登録する

`usability-probe` skill 専用の Playwright MCP。理由は 2 つ: (1) `--storage-state` 起動フラグは registration 時に固定されるため、プローブ専用の認証済みセッションを積んだ別プロセスが要る (2) 常駐 MCP を増やさない（§常駐を増やさない）。token は不要（`op run` も headersHelper も無し）だが、`--storage-state` が指すファイルは実セッションの cookie を含むため、使い終わったら登録解除とファイル削除をセットで行う。

**navigation の scope は `--allowed-origins` で宣言するが、これはセキュリティ境界ではない。** `@playwright/mcp --help` に明記: 「does not serve as a security boundary and does not affect redirects」。実際に構造として塞がれているのは `file://` navigation だけ（`--allow-unrestricted-file-access` を渡さない限り既定でブロックされる。本登録コマンドは渡さない）。`--allowed-origins` は誤って `--base-url` と無関係な外部サイトへ迷い込むのを防ぐ宣言的な足場として付ける（probe 対象の origin と一致させる）。

```bash
# 使う時（storageState は事前生成したパスを指す。
# --allowed-origins は probe 対象の --base-url と同じ origin に揃える）
claude mcp add-json usability-probe-browser "{\"command\":\"npx\",\"args\":[\"-y\",\"@playwright/mcp@latest\",\"--storage-state=$(pwd)/apps/product/.probe/storage-state.json\",\"--allowed-origins=http://localhost:3000\"]}" -s user

# 使い終わったら（登録解除 + storageState ファイル削除の両方）
claude mcp remove usability-probe-browser -s user
cd "$(git rev-parse --show-toplevel)/apps/product" && rm -rf .probe
```

登録前に storageState を生成しておくこと（`pnpm --filter @dayopt/product probe:setup`）。生成せずに登録すると `--storage-state` のパスが存在せず、未認証のブラウザが起動する。

## 接続済み MCP サーバー

### Sentry (`mcp__sentry__*`)

**既定は `sentry` CLI**（下記 §Sentry CLI）。MCP はオンデマンド登録。

- **Invoke when**（CLI で閉じない時のみ MCP を使う）:
  - スタックトレースから原因が曖昧で `analyze_issue_with_seer` の一次切り分けが要る時
  - 複数 issue/event を横断する構造化検索が CLI の単発取得では足りない時
- **Before use**:
  - まず `sentry` CLI（下記）で足りるか検討する
  - Seer 分析や横断検索が必要と判断したら `claude mcp add` で `sentry`（`https://mcp.sentry.dev/mcp`）をオンデマンド登録し、`/mcp` で OAuth 承認する。承認後の OAuth トークンは Claude 側にキャッシュされ、desktop アプリ起動・zsh ターミナル起動のどちらでも動くため再登録は `/mcp` 承認 1 回で済む
  - 疎通確認は `whoami` または `find_organizations`（`dayopt` org が返れば OK）
  - 使い終わったら `claude mcp remove sentry -s user`
- **`Authorization Expired` / 401 が出たら**: `/mcp` で `sentry` を再承認する。OAuth トークンの失効サイン。
- **フォールバック**: MCP を使わない間は Sentry Web UI、または下記の Sentry CLI を使う。
- **境界ケース**: 「再現できますか？」とユーザーに尋ねる前に Sentry（CLI 優先）で対象 issue を探す。ヒットすればスタックトレースから直接原因を特定できるので、ユーザーの手間を省ける。

### Sentry CLI（`sentry` コマンド、cli.sentry.dev）

エージェント向けの issue 閲覧・Seer 分析ツール。**既存の `sentry-cli`（sourcemap upload 等のビルドツール、npm package）とは別物。** コマンド名が紛らわしいため区別する。

MCP（上記）との分担: **メインセッションの構造化・横断調査は MCP、subagent・script からの単発参照は CLI**（MCP は session 単位の配線が要るため届かない場所を CLI が埋める）。

- **Invoke when**:
  - MCP の配線が無い場所（subagent 内、script、CI）から Sentry issue を参照したい時
  - 単純な単発取得（1 issue の閲覧、org/project 一覧）で MCP を起動するほどではない時
- **Before use**:
  - インストール: `curl -fsS https://cli.sentry.dev/install | bash`（初回のみ）
  - **認証は env var 方式のみを使う。`sentry auth login`（ブラウザ OAuth）は使わない**:
    ```bash
    SENTRY_AUTH_TOKEN="op://agent/sentry-cli-readonly/credential" op run -- sentry <command>
    ```
    token は read-only scope（project:read, org:read, event:read, member:read, team:read）で発行済み。env var 方式では token がディスクに一切残らない
- **主要コマンド**: `sentry issue list [org/project] --query "<query>"` / `sentry issue view <id>` / `sentry issue explain <id>`（Seer root cause）/ `sentry org list` / `sentry project list` / `sentry release list`
- **境界ケース**: write 系コマンド（`issue resolve` 等）はこの token では想定運用外。write が必要な場面は Sentry Web UI を使う

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
  - `supabase`(cloud): §`supabase`(cloud) はオンデマンド登録する 参照
- **絶対ルール**: `supabase`(cloud) は global 設定で `--read-only` + production project に固定。**cloud 経由で書き込み・migration はしない**。schema 変更は `supabase-local` → PR Preview → production の既存フロー（`supabase` skill）で行う。
- **境界ケース**: `pnpm types:generate` を走らせる前に、スキーマ変更が DB に反映済みか確認する（未反映だと型生成しても差分が出ない）。

### Vercel（`vercel` CLI が正、MCP は登録しない）

MCP の tool set には `buy_domain` / `buy_pro` / `buy_credits` / `pause_project` / `deploy_to_vercel` など購入・停止・deploy の不可逆な能力が含まれ、常駐させると毎セッションその権限が載る（原則③違反）。read 用途は `vercel` CLI（50.32.5、OAuth ログイン済み）で閉じる。

- **Invoke when**: デプロイ状態・build log・runtime log・env 一覧を確認したい時
- **主要コマンド**（テーブル出力は `| head` / `| rg` で射影する。`--json` を持つのは `vercel logs` のみ）:
  - `vercel ls | head -20`（最新 deployment 一覧。repo が link 済みなら `--scope` 不要。2026-09-02 実測: 約 8 行で MCP `list_deployments` の 1 回 34k chars と同じ情報が取れる）
  - `vercel inspect <deployment-url>`（状態・commit・region）
  - `vercel inspect --logs <deployment-url> | tail -80`（build log）
  - `vercel logs <deployment-url> --json | jq -c 'select(.level=="error")' | head`（runtime error）
  - `vercel project ls`、`vercel env ls`（既存 `pnpm vercel:env`）
- **ドキュメント参照**: `context7`（`resolve-library-id vercel` → `query-docs`）か WebFetch を使う。Vercel MCP の `search_vercel_documentation` は使わない。
- **絶対ルール**: 本番 promote / env 書き換えは既存 workflow（`promote.yml`、`pnpm vercel:env:pull:unsafe`）のみで行う。CLI から `vercel deploy` / `vercel env add` を production に対して打たない。`--token` は渡さない（pre-tool-guard がブロックする）。
- **MCP が要る場面**（横断 deployment 検索、agent run trace など CLI に無い機能）: `claude mcp add` で `https://mcp.vercel.com` をオンデマンド登録し、`/mcp` で OAuth 承認、使い終わったら `claude mcp remove vercel -s user`。

### Context7 (`mcp__context7__*`)

- **Invoke when**:
  - Next.js / React / tRPC / Supabase client / TanStack Query / Zustand などバージョン固有挙動が問題になりうるライブラリ API を扱う時
  - エラーメッセージが最新ドキュメントの API シグネチャと一致しているか確認したい時
  - 新規依存追加を検討する際、最新の推奨 API 設計を確認する時
- **Before use**: `resolve-library-id` から `query-docs` の順に確認する
- **境界ケース**: 「知っている」と思っても、version依存のトピックは必ずmanifestを確認し、`query-docs`で一次資料を確認してから回答する。

### Eagle (`mcp__eagle__*`)

デザインアセット運用の視覚検索ライブラリ。

- **Invoke when**:
  - UI 設計・改善で参考事例を探す時（`ai_search_by_text` でセマンティック検索、`item_query` でタグ・★絞り込み）
  - font / icon / illust などの作業用素材を探す時
  - 過去のブランドクリエイティブの出所・掲載先を確認する時
- **Before use**:
  - `nc -vz 127.0.0.1 41596` で Eagle app 側の待ち受けを確認する
  - MCP tool の直接呼び出しは `POST http://127.0.0.1:41596/api/tools/call` に `{"tool": "...", "params": {...}}`。**引数キーは `params`**
  - `ai_search_status` の `totalSyncedItems` で AI 検索インデックスを確認する
  - `item_query` はタグ・annotation を対象とし、**ファイル名では検索できない**
- **境界ケース**: 実装の見た目を確認したい時は Eagle を開かない。Storybook が正。ライブラリのアイテムを削除・trash 移動しない。

### Storybook (`mcp__storybook__*`)

公式アドオン `@storybook/addon-mcp` が Storybook dev サーバー上に MCP を公開する（`http://localhost:6006/mcp`）。

- **Invoke when**:
  - component の props / variant / story 構成をコードを離れず把握したい時
  - design token の選択（どのサイズ・spacing・icon を使うか）を確認したい時（`storybook` skill 本体を参照）
- **Before use**: `pnpm storybook`（localhost:6006）が起動していることを確認する（`nc -z localhost 6006`）
- **境界ケース**: Storybook MCP は構造化知識取得に使い、見た目の検証には使わない。

### MCP を持たない経路

GitHub は `gh` CLI が正（`--json` + `--jq` で射影、横断集計も足りる。2026-08-13 に global から削除済み）。ブラウザ操作は Claude Code 組み込みの Browser tool が正（同日削除）。この 2 つは MCP へ戻さない。

### UptimeRobot (`mcp__uptimerobot__*`)

外形監視の調査経路。**Read-only API Key で接続するため read 系 tool しか公開されず、monitor の作成・変更・pause は構造的に不可能。**

- **役割分担**: alert の一次通知は既存メール。障害調査・横断要約が MCP。app 内部 error は Sentry、deployment / function は Vercel。確認順は「Sentry → UptimeRobot → Vercel」
- **Invoke when**: ユーザーが障害・ダウンタイムを報告した時、または UptimeRobot のメール alert 受領後の一次切り分けで現在状態・直近 incident・uptime・response time を確認する
- **Before use**: §`uptimerobot` はオンデマンド登録する 参照。疎通確認は `list-monitors`
- **401 / 接続失敗時**: 1Password 未起動・ロック中を疑う
- **フォールバック**: UptimeRobot dashboard（Web UI）とメール通知
- **境界ケース**: rate limit は account の API と共有（Free plan 10 req/min）。MCP の自然言語出力を根拠に監視設定を変更しない。

## 共通原則

1. **推測より確認**: 「たぶん X」と答える前に MCP で裏を取れるか検討する
2. **ユーザーの手間を減らす**: URL・ID が提示されたら、本文ペーストを求める前に MCP で取得する
3. **デプロイ後の能動チェック**: 本番デプロイ直後は Sentry でエラー増加を自発的に確認する
