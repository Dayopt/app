# MCP Server 設計（Phase 分割）

策定日: 2026-04-30
最終更新: 2026-04-30（v3: Phase 1 を solo dogfood に圧縮、Phase 1.5 / 2 / 3 に細分）
ステータス: 設計中（Phase 1 着手前）
オーナー: Tomoya

## Revision Log

- **v1 (2026-04-30)**: 初版。Decision 1-5 + Phase 1 8 step
- **v2 (2026-04-30)**: `/plan-review` の fact-checker / critic 指摘を反映。`getByDateRange` → `list` 修正、`/v1/mcp` → `/mcp` versionless 化、token model 独立、DCR を Phase 2 送り、Decision 6-9 追加
- **v3 (2026-04-30)**: Phase 1 を solo dogfood まで圧縮。Phase 1.5（最初の有料 Pro user 受け入れ）/ Phase 2（公式対応・tool freeze）/ Phase 3（LP・ADR・docs）に細分。
  - Phase 1 から削除: `entries.daily_summary` / 接続済み client 一覧 UI / `mcp.revokeToken` mutation / `customer.subscription.updated` webhook / `/oauth/authorize` と `/api/mcp` の rate limit / ja consent UI / Free user 403 verification → 全部 Phase 1.5
  - Phase 1 で残す: subdomain + rewrite / schema migration / OAuth flow / versionless URL / scope 3 宣言（実装 1）/ `entries.list` / opaque token verify / `proProcedure` の OAuth-DB lookup 強制 / `.well-known/*` / `McpApiSection` の URL 文字列修正
  - Decision 1 補強: 暴露窓は **5 分**（access_token TTL）。`proProcedure` 毎リクエスト DB lookup で webhook 不要

## Context

Dayopt は Pro 課金ユーザー向けに **read-only Remote MCP server** を提供する。Pro user が `https://mcp.dayopt.app/mcp` を Claude.ai / ChatGPT / Cursor の Custom Connector に貼る → OAuth flow → 各 AI から Dayopt の entries / tags / stats を read できる、という体験を狙う。**ユーザーがコピペするのは URL であって API key ではない**（OAuth 設計のため）。

`feedd7641 chore(ai): サービス内 AI 機能を撤去し MCP の受け皿のみ残す`（2026-04-29）でサービス内 LLM 統合は撤去され、**MCP の受け皿のみ温存** された状態。受け皿は 4 レイヤに散在:

- **UI**: [`src/features/settings/components/data-settings.tsx:251-347`](../../../src/features/settings/components/data-settings.tsx) の `McpApiSection`（Pro gate 込み、URL ハードコード `https://mcp.dayopt.app/v1/sse`、API key 表示スケルトンは vestige）
- **Auth**: [`src/lib/trpc/procedures.ts:102-125`](../../../src/lib/trpc/procedures.ts) の `oauth` モード分岐 + [`src/lib/supabase/oauth.ts:76-149`](../../../src/lib/supabase/oauth.ts) の `extractBearerToken` / `verifyOAuthToken`
- **課金 gate**: [`src/lib/trpc/procedures.ts:357-393`](../../../src/lib/trpc/procedures.ts) の `proProcedure`
- **DB**: `api_keys` テーブル（[`src/lib/database.types.ts:11-37`](../../../src/lib/database.types.ts)）+ [`supabase/migrations/20260317120000_add_stripe_billing_columns.sql`](../../../supabase/migrations/20260317120000_add_stripe_billing_columns.sql) の `profiles.subscription_status`
- **i18n**: `messages/{ja,en}/settings.json` の `settings.dataControls.mcp.*`

## Goal / Non-Goal

### Goal（最終形）

Pro 課金ユーザーが Dayopt 設定画面で MCP Server URL をコピー → Claude.ai / ChatGPT / Cursor の Custom Connector に貼って OAuth 同意 → 各 AI から自分の Dayopt データを read できる。

### Goal（Phase 1）

**Tomoya 自身**が Claude.ai connectors から OAuth 同意して `entries.list` を呼べるところまで。1 client / 1 tool / 1 user。

### Non-Goal（永続的に scope 外）

- **write 系 tool**: read-only に絞る（書き戻し経路を持たないこと自体が contract）
- **Free 公開**: Pro 限定機能
- **subscription / push / webhook 経由の通知**: stateful 機能は scope 外
- **B2B 用途**（API key 大量発行、tenant 管理）: B2C なので考慮しない
- **API key コピペ UX**: OAuth flow 一本に絞る（Claude.ai / ChatGPT / Cursor は全 OAuth 前提）

---

## Decision 1: OAuth 2.1 token model — Dayopt 自身が AS、token は Dayopt が独立に発行

### 採用: Dayopt-as-AS（独立 token）

**根拠**: Supabase JWT を opaque token として保管すると Supabase short-lived JWT (1h) と Dayopt opaque token の生死が乖離する。MCP client が握る token と backend lookup の真偽を一致させるため、Dayopt が token の生死を完全制御する必要がある。

### Token 仕様

- **access_token**: opaque random 256-bit、prefix `dop_at_`、TTL **5 分**、rotation なし
- **refresh_token**: opaque random 256-bit、prefix `dop_rt_`、TTL **30 日**、rotation あり（refresh ごとに新 token 発行 + 旧 token revoke）
- **storage**: `oauth_tokens` テーブルに `token_hash`（SHA-256）で格納。生 token は DB に置かない
- **verify**: 毎リクエスト DB lookup（`token_hash` → `revoked_at IS NULL AND expires_at > now()` → `user_id` 取得）
- **subscription_status 評価**: OAuth 経路では JWT claim を**信じない**。`proProcedure` が `authMode === 'oauth'` の時は **必ず DB lookup**（[`procedures.ts:357-393`](../../../src/lib/trpc/procedures.ts) の修正必要）

### 暴露窓 = 最長 5 分

Pro 解約直後 → 既存 access_token は最長 5 分で expire。その間も `proProcedure` が毎リクエスト DB lookup で `subscription_status='canceled'` を見るので tool call 自体が **403 で即座に止まる**。refresh 試行は `proProcedure` で 403 → refresh chain 終了。**Stripe webhook での即時 revocation は不要**（Phase 1.5 で「保険」として `customer.subscription.updated` listening を追加）。

### Authorization flow（Phase 1）

1. Client → `https://app.dayopt.app/oauth/authorize?response_type=code&client_id=claude-ai&redirect_uri=...&code_challenge=...&scope=read:entries`
2. User が Dayopt にログイン済みなら（Supabase cookie 検査） → consent UI 表示
3. ユーザー approve → authorization code 発行（TTL 60 秒、single use）→ `redirect_uri` に `?code=...&state=...`
4. Client → `https://app.dayopt.app/oauth/token` POST with `grant_type=authorization_code&code=...&code_verifier=...` → `{access_token, refresh_token, token_type:"Bearer", expires_in:300, scope:"..."}`
5. Client → `https://mcp.dayopt.app/mcp` with `Authorization: Bearer dop_at_...`

### 含意

- `/oauth/authorize`, `/oauth/token` の **公開 URL は `app.dayopt.app/oauth/*`**（mcp subdomain ではない、AS は main domain に置く）
- `/.well-known/oauth-authorization-server` も app.dayopt.app 直下
- `/.well-known/oauth-protected-resource` は mcp.dayopt.app 直下、`{authorization_servers: ["https://app.dayopt.app"]}` を返す（RFC 9728）
- `/oauth/register` (DCR) は Phase 1 では実装しない（Phase 2）

---

## Decision 2: Transport — Streamable HTTP、URL は versionless

### 採用: Streamable HTTP（単一 endpoint）

`/v1/sse` → **`https://mcp.dayopt.app/mcp`**（v1 を path から削除）

**根拠**: SSE は MCP 公式 SDK で deprecated。Streamable HTTP は backward-compat で同 URL に SSE response も流せる。`/v1/` を path に焼き付けると MCP の version negotiation（`server_info.version` + `Mcp-Protocol-Version` header）と二重化する。Breaking 変更時は別 path（`/mcp/v2`）を切ればよい。

`[irreversible]` 判断、PoC 公開前の今しか変えられない。

---

## Decision 3: Hosting topology — AS は app.dayopt.app、RS は mcp.dayopt.app

### 採用

- **AS (Authorization Server)**: `app.dayopt.app` 直下
  - `/oauth/authorize`, `/oauth/token`
  - `/.well-known/oauth-authorization-server`
  - consent UI: `app.dayopt.app/[locale]/oauth/consent`（既存 i18n / shell / Supabase cookie をそのまま使える）
- **RS (Resource Server)**: `mcp.dayopt.app` 直下
  - `/mcp`（単一 MCP endpoint）
  - `/.well-known/oauth-protected-resource`

`mcp.dayopt.app` は Vercel rewrite で main app に proxy。

**根拠**: User 認証は Supabase cookie に依存し、cookie domain 切り替えはバグの温床。Consent UI を main domain に置けば cookie 問題ゼロ。MCP RS は subdomain に隔離することで CORS / 専用 monitoring / 将来の独立 deploy 余地を残す。

### Internal route handler 配置

```
src/app/api/oauth/
├── authorize/route.ts          # GET (consent redirect) + POST (consent submit)
├── token/route.ts              # POST (code → token, refresh → token)
src/app/api/mcp/
└── route.ts                    # POST (Streamable HTTP MCP)
src/app/.well-known/
├── oauth-authorization-server/route.ts
├── oauth-protected-resource/route.ts  # mcp.dayopt.app 経由でアクセス
src/app/[locale]/oauth/consent/page.tsx
```

### Vercel rewrite

```jsonc
// vercel.json
{
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/mcp",
      "has": [{ "type": "host", "value": "mcp.dayopt.app" }],
    },
    {
      "source": "/.well-known/oauth-protected-resource",
      "destination": "/api/well-known/oauth-protected-resource",
      "has": [{ "type": "host", "value": "mcp.dayopt.app" }],
    },
    {
      "source": "/oauth/:path*",
      "destination": "/api/oauth/:path*",
      "has": [{ "type": "host", "value": "app.dayopt.app" }],
    },
  ],
}
```

---

## Decision 4: api_keys → oauth_tokens rename + 拡張、oauth_clients は Phase 2

### 採用

`api_keys` は未使用 vestige（[`McpApiSection` の `apiKey: null` ハードコード](../../../src/features/settings/components/data-settings.tsx)、tRPC router 参照ゼロ）。OAuth opaque token storage に転用。

### Phase 1 schema

```sql
-- 20260501XXXXXX_rename_api_keys_to_oauth_tokens.sql
ALTER TABLE api_keys RENAME TO oauth_tokens;
ALTER TABLE oauth_tokens RENAME COLUMN key_hash TO token_hash;

ALTER TABLE oauth_tokens
  ADD COLUMN token_type text NOT NULL DEFAULT 'access'
    CHECK (token_type IN ('access', 'refresh')),
  ADD COLUMN client_id text NOT NULL DEFAULT 'unknown'
    CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  ADD COLUMN scopes text[] NOT NULL DEFAULT ARRAY['read:entries']::text[],
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  ADD COLUMN revoked_at timestamptz,                            -- Phase 1 では未使用、緊急 DB 直 UPDATE 用に予約
  ADD COLUMN parent_token_id uuid REFERENCES oauth_tokens(id);  -- refresh chain 追跡
ALTER TABLE oauth_tokens ALTER COLUMN client_id DROP DEFAULT;
ALTER TABLE oauth_tokens ALTER COLUMN token_type DROP DEFAULT;
ALTER TABLE oauth_tokens ALTER COLUMN expires_at DROP DEFAULT;

CREATE INDEX idx_oauth_tokens_token_hash ON oauth_tokens(token_hash);
CREATE INDEX idx_oauth_tokens_user_active
  ON oauth_tokens(user_id) WHERE revoked_at IS NULL;

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_tokens_select_own ON oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY oauth_tokens_update_revoke_own ON oauth_tokens
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- INSERT は service-role のみ（RLS deny）
```

`oauth_clients` テーブル（DCR 受け皿）は Phase 2。Phase 1 は CHECK 制約で 3 client allowlist。

### authorization_codes は別 table

```sql
CREATE TABLE oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL CHECK (code_challenge_method = 'S256'),
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  consumed_at timestamptz
);
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
-- service-role only
```

post-apply で `npm run types:generate` を**同 PR 内**で実行・コミット。

### `revoked_at` カラムを Phase 1 で残す理由

Phase 1 では即時 revocation の自動化（webhook）はしないが、緊急時に Tomoya が DB に直接 `UPDATE oauth_tokens SET revoked_at = now() WHERE user_id = $1` を打って token を切れるようにする。`verify-opaque-token` のロジック自体は Phase 1 から `revoked_at IS NULL` を見る（無料の安全弁）。

---

## Decision 5: 初期 tool — Phase 1 は `entries.list` 1 つだけ

### 全候補

| Tool                             | Source                                                                                                                                            | Phase |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `entries.list(filter)`           | [`features/entry/server/router.ts:74`](../../../src/features/entry/server/router.ts) `list`（`entryFilterSchema`：startDate/endDate/tagId/limit） | **1** |
| `entries.daily_summary(date)`    | [`features/entry/server/statistics.ts:173`](../../../src/features/entry/server/statistics.ts) `getDailyHours`                                     | 1.5   |
| `tags.list()`                    | [`features/tags/server/router.ts:33`](../../../src/features/tags/server/router.ts) `list` / `:63` `listHierarchy`                                 | 2     |
| `tags.stats(date_range, tag_id)` | [`features/entry/server/tag-statistics.ts`](../../../src/features/entry/server/tag-statistics.ts)                                                 | 2     |
| `entries.search(query, filter?)` | （未実装）                                                                                                                                        | 2     |

### Phase 1 採用: `entries.list(filter)` のみ

`service.list({ userId, startDate?, endDate?, tagId?, limit?, offset? })` を `proProcedure` 経由で wrap。

**根拠**: PoC では「OAuth flow 成立 + 1 tool 呼び出し成功」が gate。tool が複数あると failure 切り分けが遅くなる。`list` は read-only の代表的 read-shape（filtered list）でそれ単体で diff 検証になる。

### tool 命名は experimental

Phase 1 の tool 名 `entries.list` は **freeze しない**（Reversibility `[hours]`）。Phase 2 で他 client（ChatGPT / Cursor）の usage を見て命名規則と signature を確定する。

### tool response normalize

internal service の戻り値（Date instance、内部命名 field、nested object）を**直接 return しない**。MCP tool 応答用 Zod schema で正規化:

- 全 datetime: ISO 8601 string、必ず timezone offset 付き（例 `2026-04-30T09:00:00+09:00`）
- 期間: `duration_minutes` (number) で統一
- ID: string（UUID v4）
- snake_case で field を返す
- soft-deleted (`entries.deleted_at IS NOT NULL`) は除外（既存 RLS で自動）

normalize layer は `src/lib/mcp/tools/<tool>.ts`。

### tool input

- date は ISO 8601 string + tz 必須
- `filter.limit` 上限は 200 entries / call
- pagination は `offset`（明示 cursor は Phase 2）

---

## Decision 6: scope 粒度

### 採用

Phase 1 から resource 単位の最小粒度で **3 つ宣言**:

- `read:entries` — `entries.list` / `entries.daily_summary`（Phase 1.5）
- `read:tags` — `tags.list` / `tags.stats`（Phase 2）
- `read:stats` — global stats / weekly summary（Phase 2）

**Phase 1 では `read:entries` のみ実装** されるが、3 つを最初から `scopes_supported` に列挙。consent 画面は client が要求した scope のみ表示。

**根拠**: scope 文字列は `scopes_supported` で公開され client が永続記録する。後から `read` を分割すると既発行 token の意味が変わる。最初から最小粒度で切る方が安全。

scope は `oauth_tokens.scopes text[]` に格納。MCP runtime は tool dispatch 時に「呼ばれた tool が要求 scope を token が持っているか」を verify。

---

## Decision 7: rate limit — Phase 1 は `/oauth/token` のみ

### 採用

| Endpoint               | Limit                            | Phase | 根拠                                         |
| ---------------------- | -------------------------------- | ----- | -------------------------------------------- |
| `POST /oauth/token`    | IP あたり **10 req / min**       | **1** | client_secret brute force / code replay 防御 |
| `GET /oauth/authorize` | IP あたり **30 req / min**       | 1.5   | Tomoya 自身しか consent しないため不要       |
| `POST /api/mcp`        | user_id あたり **300 req / min** | 1.5   | abuse する agent が居ないため不要            |

**根拠**: Phase 1 は solo dogfood なので abuse surface は `/oauth/token` のみ（万一 token が漏れた場合の brute force 防御）。Phase 1.5 で初の有料 user が出る前に `/oauth/authorize` と `/api/mcp` も追加。`procedures.ts:19` で既に Upstash を import 済みなので追加コストは低い。

---

## Decision 8: server_info

### 採用

```typescript
{
  name: 'dayopt',
  version: '<package.json の semver>',  // 例 '0.18.3'
  description: 'Dayopt time tracking & timeboxing — read-only',
}
```

`Mcp-Protocol-Version` header は SDK が自動付与。`server_info.version` は app の semver（protocol version とは別）。

**根拠**: 一部 MCP client は `server_info.name` を tool namespace の prefix にしたり UI 表示に使う。決めないと client 側に default が表示される。`name: 'dayopt'` は `[irreversible]`。

---

## Decision 9: code 配置

### 採用

- `src/lib/mcp/` — MCP runtime（tool dispatch、Streamable HTTP transport handler、response normalizer）
- `src/lib/oauth-server/` — OAuth AS logic（authorize / token / consent / token issuing / verify）
- `src/app/api/{mcp,oauth}/*` `src/app/.well-known/*` は composition 層、上記 lib を呼ぶだけの薄い wrapper

**`features/mcp/` は作らない**。MCP は app の機能境界ではなく delivery channel（cross-cutting infra）。CLAUDE.md の「新規トップレベル feature 追加は相談」とも整合。

### 内部 import 経路

- route handler → `src/lib/mcp/`、`src/lib/oauth-server/` を直接 import
- `src/lib/mcp/tools/entries.ts` → tRPC service 層を**直接呼ばない**。`proProcedure` 経由の caller helper（`src/lib/mcp/trpc-bridge.ts`）で auth / 課金 gate / Sentry tag を一元化
- `src/lib/oauth-server/` は `src/lib/supabase/` `src/lib/rate-limit/` `src/lib/logger` を import 可。`features/` を import しない

---

## Phase 分割

### Phase 1 — Solo dogfood（Tomoya 自身が動かせる状態）

着地点: **Tomoya が Claude.ai connectors から OAuth 同意して `entries.list` を呼べる**。1 client / 1 tool / 1 user。

含むもの:

- `mcp.dayopt.app` subdomain + Vercel rewrite（3 つ）
- schema migration: `oauth_tokens` rename + 拡張（`revoked_at` カラム含む）+ `oauth_authorization_codes` 新設
- OAuth flow: `/oauth/authorize`（PKCE S256）+ `/oauth/token`（authorization_code + refresh_token grant）
- `.well-known/oauth-authorization-server`（app.dayopt.app）+ `.well-known/oauth-protected-resource`（mcp.dayopt.app）
- versionless URL `https://mcp.dayopt.app/mcp`
- scope 3 つ宣言（実装は `read:entries` のみ）
- `entries.list(filter)` 1 tool
- opaque token verify（`verify-opaque-token.ts`、毎リクエスト DB lookup）
- `proProcedure` 修正: `authMode === 'oauth'` で JWT claim を信じず DB lookup 強制
- `McpApiSection` の URL ハードコード `/v1/sse` → `/mcp` 修正（5 分作業、Tomoya 自身が貼る URL）
- `/oauth/token` rate limit（10 req/IP/min）
- consent UI: **en のみ**（`messages/en/oauth.json` 作成、`messages/ja/oauth.json` は en 文言のままで namespace 不在 crash 予防）
- Sentry tag（`mcp.tool`, `oauth.client_id`）は仕込むだけ（verification には含めない）

含まないもの → Phase 1.5 / 2 / 3:

- 即時 revocation webhook → Phase 1.5（暴露窓 5 分は Decision 1 で許容）
- 接続済み client 一覧 UI / `mcp.revokeToken` mutation → Phase 1.5（緊急時は DB 直 UPDATE）
- consent UI 日本語翻訳 → Phase 1.5
- `/oauth/authorize` + `/api/mcp` rate limit → Phase 1.5
- audit log → Phase 1.5
- `entries.daily_summary` → Phase 1.5
- DCR + ChatGPT / Cursor 公式接続確認 → Phase 2
- LP / blog / ADR / docs → Phase 3

### Phase 1.5 — First paying user prep（最初の有料 Pro user 受け入れ前）

着地点: 自分以外の Pro user に課金させて壊れない状態。

- `customer.subscription.updated` webhook で `oauth_tokens.revoked_at` を打つ（保険、Decision 1 の DB lookup と二重化）
- 接続済み client 一覧 UI（`McpApiSection` の API key 表示部を置換）
- `mcp.revokeToken` mutation（自分の token のみ revoke）
- `/oauth/authorize`（30 req/IP/min）+ `/api/mcp`（300 req/user/min）rate limit
- audit log（`oauth_tokens.last_used_at` + `oauth_audit_log` table、誰がいつ何の tool を呼んだか）
- `entries.daily_summary` tool 追加
- consent UI 日本語翻訳（`messages/ja/oauth.json` 翻訳）

### Phase 2 — 公式対応 + tool freeze

- DCR (RFC 7591) 実装、`oauth_clients` table 新設、CHECK 制約 → FK 化
- `/oauth/register` に Turnstile + rate limit 適用
- ChatGPT MCP / Cursor で接続検証
- tool 名 freeze（3 client の usage を見て signature 確定、Reversibility `[irreversible]` に格上げ）
- tool 拡充: `tags.list` / `tags.stats` / `entries.search`
- per-day quota（abuse 対策）

### Phase 3 — 公開 + ナレッジ化

- LP / blog 訴求（「Bring your AI」軸）
- `docs/adr/ADR-00X-mcp-remote-server.md` 起票
- `.storybook/docs/product/projects/mcp-server/` に移動 + `summary.md` 追加
- 技術 docs 公開（`content/docs/integrations/mcp.mdx`）

---

## Reversibility Table（Phase 1 限定）

| Step                                                     | Reversibility    | 備考                                              |
| -------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| `mcp.dayopt.app` subdomain + Vercel rewrite              | `[hours]`        | DNS + rewrite 削除                                |
| **`mcp.dayopt.app/mcp` の URL path 公開**                | `[irreversible]` | 外部 client が永続記録                            |
| **`app.dayopt.app/oauth/{authorize,token}` 公開 URL**    | `[irreversible]` | 後で client が `.well-known` から取得して永続記録 |
| **scope 文字列 `read:entries` `read:tags` `read:stats`** | `[irreversible]` | `scopes_supported` を client が永続記録           |
| **server_info `name: 'dayopt'`**                         | `[irreversible]` | 一部 client が tool namespace prefix に使う       |
| `/.well-known/*` metadata schema                         | `[hours]`        | client は都度取得する spec                        |
| Streamable HTTP transport 採用                           | `[hours]`        | SSE 切り戻し可能（spec 退行で非推奨）             |
| tool 名 `entries.list` の signature                      | `[hours]`        | Phase 1 は experimental、Phase 2 で freeze        |
| `api_keys` → `oauth_tokens` rename + schema 拡張         | `[hours]`        | migration 1 つで rollback                         |
| `proProcedure` の `authMode==='oauth'` で DB lookup 強制 | `[hours]`        | feature flag で off 可                            |
| `McpApiSection` URL 文字列修正                           | `[minutes]`      | git revert                                        |

`[irreversible]` 行の正当化:

- **`mcp.dayopt.app/mcp` (versionless)**: MCP の version negotiation（header / metadata）と二重化させない
- **`app.dayopt.app/oauth/*`**: spec 慣用に従う
- **scope 粒度**: 最初から最小単位、`'read'` 単一だと後の分割が breaking change
- **server_info name**: app 識別子はリリース後の変更が困難（client 側 cache）

---

## Existing Code to Reuse（Phase 1）

### Auth 層

- [`src/lib/trpc/procedures.ts:87-219`](../../../src/lib/trpc/procedures.ts) `createTRPCContext` — OAuth 経路では Bearer token を **MCP 専用の `verifyOpaqueToken`（新設）** に通す
- [`src/lib/trpc/procedures.ts:357-393`](../../../src/lib/trpc/procedures.ts) `proProcedure` — **修正必要**: `authMode === 'oauth'` のとき JWT claim を信じず DB lookup を必ず行う
- [`src/lib/supabase/oauth.ts:76`](../../../src/lib/supabase/oauth.ts) `extractBearerToken` のみ流用。`verifyOAuthToken` は OAuth flow の `/oauth/authorize` で **user 認証にのみ** 使う

### Tool source

- [`src/features/entry/server/router.ts:74`](../../../src/features/entry/server/router.ts) `list` — `entries.list` の source（`entryFilterSchema` の `startDate` / `endDate` / `tagId` / `limit` / `offset`）

MCP tool は tRPC service 層を**直接呼ばない**。`proProcedure` 経由の `src/lib/mcp/trpc-bridge.ts`（新設）で auth / 課金 gate / Sentry tag を一元化。

### DB / 課金

- [`supabase/migrations/20260317120000_add_stripe_billing_columns.sql`](../../../supabase/migrations/20260317120000_add_stripe_billing_columns.sql) — `subscription_status` の許容値 / CHECK
- [`supabase/migrations/20260319110000_custom_access_token_hook.sql`](../../../supabase/migrations/20260319110000_custom_access_token_hook.sql) — JWT custom claim hook（Cookie 経路では引き続き有効、OAuth 経路では使わない）

### Infra

- [`src/lib/rate-limit/upstash.ts`](../../../src/lib/rate-limit/upstash.ts) — Decision 7 で `/oauth/token` に適用

### UI

- [`src/features/settings/components/data-settings.tsx:251-347`](../../../src/features/settings/components/data-settings.tsx) `McpApiSection` — Phase 1 では URL ハードコードのみ `/v1/sse` → `/mcp` に修正。API key 表示 / connected client list は Phase 1.5
- 新 namespace `oauth`: `messages/en/oauth.json` 新設（en 文言）、`messages/ja/oauth.json` も en 文言のまま作成（namespace 不在 crash 予防）、`src/app/[locale]/(app)/layout.tsx:32` の `APP_NAMESPACES` に `'oauth'` を追加

---

## What I'm Not Doing（Phase 1 で明示的に却下）

- **DCR (RFC 7591) 実装** → Phase 2
- **`oauth_clients` table 新設** → Phase 2
- **`/oauth/authorize` と `/api/mcp` の rate limit** → Phase 1.5（Tomoya のみ使用、abuse なし）
- **`customer.subscription.updated` webhook** → Phase 1.5（暴露窓 5 分は Decision 1 で許容）
- **接続済み client 一覧 UI / `mcp.revokeToken` mutation** → Phase 1.5（緊急時は DB 直 UPDATE）
- **consent UI 日本語翻訳** → Phase 1.5（en のみで Tomoya 自身が consent）
- **`entries.daily_summary` tool** → Phase 1.5
- **audit log** → Phase 1.5（Sentry tag のみ仕込む）
- **ChatGPT / Cursor 接続確認** → Phase 2
- **tool 名 freeze** → Phase 2（Phase 1 は experimental）
- **LP / blog 訴求** → Phase 3
- **ADR 化 / docs 公開** → Phase 3
- **write 系 tool**: 永続的に却下
- **API key コピペ UX**: 永続的に却下（OAuth 一本）
- **subagent / skill 新設**: 既存の `supabase` / `trpc-router-creating` / `security` で十分
- **「ついでに ai router 残骸クリーンアップ」**: 別 plan
- **token rotation の sliding expiration**: refresh ごと rotation で十分

---

## Phase 1 実装ステップ

### Step 0: feature 配置確定 `[minutes]`

- `src/lib/mcp/` / `src/lib/oauth-server/` ディレクトリ作成、空 barrel
- ESLint boundaries の許可ルール確認（`@/lib/*` は features から自由に import 可、逆は不可）

### Step 1: subdomain + rewrite 設定 `[hours]`

- Vercel project に `mcp.dayopt.app` を追加（TLS は Vercel 自動取得）
- `vercel.json` に Decision 3 の rewrite 3 つ追加
- 動作確認: `curl https://mcp.dayopt.app/mcp` → 401（not 502）、`curl https://app.dayopt.app/oauth/authorize` → 400 missing params（not 502）

### Step 2: schema migration `[hours]`

- `supabase/migrations/20260501XXXXXX_rename_api_keys_to_oauth_tokens.sql`（Decision 4 の SQL、`revoked_at` 含む）
- `supabase/migrations/20260501XXXXXX_create_oauth_authorization_codes.sql`
- `npm run types:generate` を**同 PR にコミット**
- Production 適用は GitHub Actions（main merge）→ `supabase` skill ルールに従う

### Step 3: OAuth Authorization Server 実装 `[hours]`

- `src/lib/oauth-server/` 配下:
  - `issue-token.ts` — opaque token 発行、SHA-256 hash 化、`oauth_tokens` insert
  - `verify-opaque-token.ts` — token_hash lookup → `revoked_at IS NULL AND expires_at > now()` チェック → user_id 返却
  - `consent.ts` — Supabase cookie で user 解決、scope 提示
  - `pkce.ts` — `code_challenge` / `code_verifier` (S256) 検証
  - `clients.ts` — static allowlist（`claude-ai`, `chatgpt`, `cursor` の `redirect_uri` ハードコード）
- `src/app/api/oauth/authorize/route.ts` — GET (redirect to consent) + POST (consent submit → code 発行)
- `src/app/api/oauth/token/route.ts` — POST (code/refresh → token)、Decision 7 の rate limit 適用
- `src/app/.well-known/oauth-authorization-server/route.ts` — RFC 8414 metadata（`scopes_supported: ['read:entries','read:tags','read:stats']`）
- `src/app/.well-known/oauth-protected-resource/route.ts` — RFC 9728 metadata
- consent UI: `src/app/[locale]/oauth/consent/page.tsx`
- 新 namespace: `messages/{en,ja}/oauth.json` 新設（en 文言のみ）、`APP_NAMESPACES` に追加

### Step 4: MCP route handler `[hours]`

- 公式 `@modelcontextprotocol/sdk` 依存追加（`package.json` + `npm i`）
- `src/lib/mcp/transport.ts` — Streamable HTTP transport の薄い wrapper
- `src/lib/mcp/server.ts` — MCP server インスタンス（`server_info: { name: 'dayopt', version: ... }`）
- `src/lib/mcp/trpc-bridge.ts` — opaque token verify → `proProcedure` ctx 構築 → tool dispatch
- `src/app/api/mcp/route.ts` — POST handler（Bearer verify + scope verify + tool dispatch）

### Step 5: `entries.list` tool 実装 `[hours]`

- `src/lib/mcp/tools/entries.ts`:
  - `entries.list({ start_date?, end_date?, tag_id?, limit?, offset? })` — `service.list({ userId, startDate, endDate, tagId, limit, offset })` を bridge 経由
- input / output Zod schema（normalize 仕様: ISO 8601 + tz、`duration_minutes`、snake_case、UUID string）
- soft-deleted は既存 RLS で自動除外
- `read:entries` scope verify を tool level で適用

### Step 6: `proProcedure` 修正 + `McpApiSection` URL 修正 `[minutes]`

- [`procedures.ts:357-393`](../../../src/lib/trpc/procedures.ts) を修正: `authMode === 'oauth'` の時は JWT claim を読まず DB lookup を必ず行う
- [`data-settings.tsx:262`](../../../src/features/settings/components/data-settings.tsx) のハードコード URL `https://mcp.dayopt.app/v1/sse` → `https://mcp.dayopt.app/mcp` に修正

### Step 7: 接続テスト `[hours]`

- Claude.ai → Settings → Connectors → "Add custom connector" → `https://mcp.dayopt.app/mcp` → static client `claude-ai` の handshake
- OAuth flow → consent（en） → `entries.list` 呼び出し成功
- error response shape 確認:
  - 401 with `WWW-Authenticate: Bearer realm="...", error="invalid_token"`
  - 403 → MCP JSON-RPC error（scope 不足は `insufficient_scope`）
  - OAuth `/oauth/token` error は RFC 6749 形式 `{error, error_description}`
- 暴露窓検証（実機ではなく logic 確認のみ）:
  - access_token TTL 5 分を SQL で確認（`expires_at - issued_at = 5 min`）
  - `proProcedure` の OAuth-DB lookup path が unit test で覆われている

---

## Verification（Phase 1 完了基準）

機能基準（測定可能、Tomoya 自身が確認）:

- [ ] Claude.ai connectors から OAuth フロー（authorize → consent → token 発行）成功
- [ ] `entries.list` 呼び出し成功（自分の entries が JSON で返る、ISO 8601 + tz、`duration_minutes` 含む）
- [ ] `/oauth/token` に 11 req/min を投げると 11 req 目が 429
- [ ] OAuth `/token` error が RFC 6749 形式（`{"error":"invalid_grant","error_description":"..."}`）
- [ ] `mcp.dayopt.app/.well-known/oauth-protected-resource` が `authorization_servers: ["https://app.dayopt.app"]` を返す
- [ ] `app.dayopt.app/.well-known/oauth-authorization-server` が `scopes_supported: ["read:entries","read:tags","read:stats"]` を含む
- [ ] `mcp.dayopt.app` の TLS cert が Vercel から自動取得され `curl --verbose` で valid

技術基準:

- [ ] `verifyOpaqueToken` の test がある（valid / expired / revoked / unknown の 4 ケース）
- [ ] `proProcedure` の `authMode==='oauth'` 分岐の test がある（DB lookup が呼ばれる）
- [ ] migration apply 後 `npm run types:generate` の差分が同 PR に含まれる

Phase 1 完了基準から外したもの（Phase 1.5 の verification に移譲）:

- 接続済み client 一覧 UI の動作確認 → Phase 1.5
- `mcp.revokeToken` mutation 検証 → Phase 1.5
- Pro 解約後の自動 revocation → Phase 1.5（Phase 1 は手動 DB UPDATE で代替）
- Free user 403 path 動作確認 → Phase 1.5
- ChatGPT / Cursor 接続確認 → Phase 2
- `entries.daily_summary` 動作確認 → Phase 1.5

---

## Next Step

1. v3 doc を Tomoya 確認 → Decision 1-9 を locked-down
2. Phase 1 Step 0（feature 配置）から実装着手
3. Phase 1 完了 → Tomoya 自身で dogfood して 1-2 週間運用
4. 問題なければ Phase 1.5 着手（最初の有料 Pro user 受け入れ）
5. Phase 1.5 完了で実質 launch ready
6. Phase 2 / 3 は launch 後の usage を見て優先順位決定
