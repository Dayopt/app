---
status: active
last_verified: 2026-08-02
code: apps/product/src/features/external-calendar/server/sync-service.ts
---

# external-calendar-import — 外部カレンダーを one-way で取り込む

[time-model-split](../_archive/time-model-split/overview.md)（Phase 1、2026-07-13 完了）に続く Phase 2 の全体設計書。決定の経緯・却下案は [ADR-025](../../product/log/2026-07-09-time-model-split.md) が正で、本書は「外部カレンダー取り込み」を connection 設計・OAuth・同期ジョブ・アプリ構造・Step 構成に落とす。**大規模判定**（新 feature 新設・新テーブル・外部 OAuth・cron 横断）。Issue #1562 の成果物。

Phase 1 から継承する拘束（本書で再決定しない）:

- one-way import のみ。Dayopt → 外部は既存 iCal export が担う
- ghost は導出概念: ミラー − (plans/records から参照済み) − (dismissed) − (cancelled)
- 自動確定禁止（strategy §4-3「自動生成はゴーストまで。確定は人間のワンタップ」）
- external は EXCLUDE 重なり制約の対象外・Review 集計対象外・ユーザー編集不可
- provider が展開した recurrence instance をそのまま保存する（独自 RRULE 展開はしない）
- 同期 window は -90日/+90日（iCal export と同じ）
- dismissed は再同期で復活させない
- ミラーへの INSERT / DELETE は service role の責務（RLS 設計済み）

---

## 1. Goal

外部カレンダー（まず Google）を one-way 取り込みで接続し、「OAuth 接続 → カレンダー選択 → 同期で `external_calendar_events` ミラーが埋まり、設定画面で接続状態と同期状況が見える」状態（= マイルストーン**「連携ができる」**）を、有料機能としてゲート可能な構造で実現する。

## 2. Minimum Viable Approach

この目標を達成する最小の骨格は 5 つ。これ以外はすべて追加であり、§11 で明示的に却下する。

1. `calendar_connections` + `calendar_connection_calendars` の migration（RLS + policy + GRANT 一式）
2. Google OAuth connect フロー（route handler 2 本 + refresh token 保管）
3. 同期エンジン（full / incremental / prune、service_role 書き込み）を TS service 層に実装
4. Vercel cron + 手動 syncNow で実行
5. Settings に Integrations カテゴリ（接続・カレンダー選択・状態表示・切断）

骨格に含めないもの: ghost 表示・変換 UX（次 project、§12 にスケッチ）、Outlook 実装（adapter interface だけ切る、§7-4）、webhook push channel。Step 6 の Settings 出荷面には、既存 iCal export URL の管理 UI と CSV export の安全化も同じ機能まとまりとして含める。

## 3. スコープ — 「連携ができる」の定義

本 project の完了時点で成立していること（検証可能な形は §14）:

- Settings から Google アカウントを接続し、取り込むカレンダーを選択できる
- 選択直後と 15 分毎の cron で、±90 日 window のイベントが `external_calendar_events` に upsert される
- 接続状態（アカウント・最終同期・エラー・再認証要求）が Settings に表示される
- 切断すると token が破棄され、未参照のミラー行が掃除される
- **Calendar 画面には何も表示されない**。ghost 表示・Plan/Record 変換は次 project

課金: 接続系 procedure に `proProcedure` を付与する。`BILLING_ENFORCED` が既定 false の間は全員素通りのため、課金運用開始前でも全ユーザーが使える。Free/Pro 境界の最終決定は #1336 の領域で、本 project は「ゲート可能な構造」までを担う。

## 4. 接続モデル

### 4-1. calendar_connections

| カラム                  | 型                   | 制約                                                                   |
| ----------------------- | -------------------- | ---------------------------------------------------------------------- |
| id                      | uuid PK              | `gen_random_uuid()`                                                    |
| user_id                 | uuid NOT NULL        | FK → auth.users, ON DELETE CASCADE                                     |
| provider                | text NOT NULL        | `google` 等。ミラーと同じく free text + not-blank CHECK（enum 不使用） |
| provider_account_id     | text NOT NULL        | Google の `sub`（id_token から取得する stable id）                     |
| provider_account_email  | text NULL            | 表示用                                                                 |
| granted_scopes          | text[] NOT NULL      | 監査・将来の scope 拡張検知用                                          |
| refresh_token_enc       | text NOT NULL        | AES-256-GCM 暗号文（§4-3）                                             |
| status                  | text NOT NULL        | `active` / `reauth_required`（`invalid_grant` 検知で遷移、§5-4）       |
| last_synced_at          | timestamptz NULL     | connection 集約の同期状態表示用                                        |
| last_sync_error         | text NULL            |                                                                        |
| created_at / updated_at | timestamptz NOT NULL | `update_updated_at()` trigger 流用                                     |

- UNIQUE `(user_id, provider, provider_account_id)` — **同一 provider の複数アカウントを最初から許容する**。schema コストはゼロで、UI は接続一覧表示で吸収する
- access token は**保存しない**。1h TTL の一時値であり、保存すると secret 面が増えるだけ（同期のたびに refresh token から mint する。§5-3）
- Step 1 実装時の追加（migration `20260723233814`）:
  - `status` は `CHECK (status IN ('active','reauth_required'))`。provider 由来の値ではなくアプリが決める閉じた集合なので、ミラーの not-blank ではなく `plans_source_check` と同型にした。3 つ目の状態を足す時は migration が要る
  - `granted_scopes` に `cardinality > 0 かつ NULL 要素なし` の CHECK。`NOT NULL` だけでは `'{}'` を通してしまい、監査用途を満たさない
  - `refresh_token_enc` / `provider_account_id` に not-blank CHECK（ミラーの書式踏襲）
  - 子テーブルの複合 FK 参照先として `UNIQUE (id, user_id)`

### 4-2. calendar_connection_calendars

**選択済みカレンダーのみ**永続化する。選択可能な一覧は接続時・設定画面表示時にオンデマンドで provider API から取得し、保存しない。

| カラム                  | 型                   | 制約                                                    |
| ----------------------- | -------------------- | ------------------------------------------------------- |
| id                      | uuid PK              |                                                         |
| connection_id           | uuid NOT NULL        | 複合 FK の一部（下記）                                  |
| user_id                 | uuid NOT NULL        | RLS 簡素化のための非正規化。owner 整合は複合 FK（下記） |
| provider_calendar_id    | text NOT NULL        | UNIQUE `(connection_id, provider_calendar_id)`          |
| calendar_name           | text NULL            |                                                         |
| sync_token              | text NULL            | **per-calendar cursor**（§6-3。NULL = 次回 full sync）  |
| last_synced_at          | timestamptz NULL     |                                                         |
| created_at / updated_at | timestamptz NOT NULL |                                                         |

sync cursor を connection ではなく calendar 行に置く理由: Google の `syncToken` は events collection（= カレンダー）単位で発行される。connection 単位に置くと複数カレンダー選択で破綻する。Microsoft Graph の deltaLink も resource 単位なので同じ形に収まる。

owner 整合は **複合 FK** で担保する（Step 1 実装時の変更。当初案は constraint trigger）。親に `UNIQUE (id, user_id)` を置き、子は `FOREIGN KEY (connection_id, user_id) REFERENCES calendar_connections (id, user_id) ON DELETE CASCADE` を持つ。constraint trigger は子側の `AFTER INSERT OR UPDATE` しか見ないため、親の `UPDATE calendar_connections SET user_id` を素通りさせる（repo はこの穴の backfill を [`20260706120100_backfill_entry_tag_owner_mismatch.sql`](../../../supabase/migrations/20260706120100_backfill_entry_tag_owner_mismatch.sql) で実際に払っている）。加えて trigger の存在確認 SELECT は lock を取らないが、RI は参照行に `FOR KEY SHARE` を取る。コストは冗長 index 1 本で、trigger 関数と REVOKE / GRANT EXECUTE の定型が不要になる。

### 4-2b. ミラーへの connection_id 追加（Step 1 実装時の追加）

`external_calendar_events` に `connection_id` を追加し、upsert key を `(user_id, provider, connection_id, provider_calendar_id, provider_event_id)` に張り替えた。

- **理由**: §4-1 が同一 provider の複数アカウントを許容するため、2 つの Google アカウントが同じ共有カレンダーを購読すると旧 4 列キーで行を奪い合い、切断時の prune も connection 単位に絞れない
- **owner 整合も複合 FK で担保する**: `FOREIGN KEY (connection_id, user_id) REFERENCES calendar_connections (id, user_id) ON DELETE SET NULL (connection_id)`。単一列 FK だと「その connection が存在する」ことしか保証せず、service_role の書き手（Step 3 の sync、Step 7 の切断）が user A のミラー行に user B の connection をぶら下げられてしまう。そうなると (a) connection 単位の prune が他ユーザーの行を巻き込み、(b) B の切断が A の行を書き換え、(c) `external_calendar_events` は table 単位 SELECT なので A が他人の connection UUID を読める。子テーブルと同じ規則を適用する（PR #1714 のレビュー指摘）
- **`ON DELETE SET NULL (connection_id)` の列リストは必須**: 列を指定しないと `user_id` まで NULL 化しようとして `23502` になる（PG15+ の構文。local / production とも 17.6）
- **`ON DELETE SET NULL` である理由**: §8 は plans / records から参照済みのミラー行を残す。それらの FK は NO ACTION なので、CASCADE にすると切断が `23503` で丸ごと失敗する。孤立した行は §8 の言う歴史的アンカーとして `connection_id IS NULL` で残る。`MATCH SIMPLE` なので `connection_id IS NULL` の行は FK 検査の対象外になり、孤立行は正当なまま
- unique index は既定の `NULLS DISTINCT` のまま。孤立行は二度と upsert に参加しないので、distinct 扱いが切断を阻むことはない
- production・local とも空テーブルの段階で入れたので backfill はゼロ

### 4-3. Token 保護（相談事項 → 採用: Option α + γ の組み合わせ）

- **Option α（採用・enforcement 層）**: token カラムを service_role 専用にする。authenticated には token 列を除いた column-scoped SELECT だけを GRANT する（§4-4）。repo には column-scoped grant の前例が 2 つある（`GRANT UPDATE(dismissed_at)`、`20260705070000_restrict_profiles_billing_column_grants`）
- **Option γ（採用・defense-in-depth 層）**: `refresh_token_enc` はアプリ層で AES-256-GCM 暗号化して保存する。鍵は env `CALENDAR_TOKEN_ENCRYPTION_KEY`。Node 標準 `crypto` のみで encrypt/decrypt 各 1 関数の helper を書く（依存追加なし）。DB dump / logical backup の漏洩に対する保険
- **Option β（却下）**: Supabase Vault に per-user secret として保存する。Vault は少数の app-level secret 用の設計で、per-user 行の churn と SQL 経由の鍵運用はリスクに見合わない。service_role を持つ経路からはどのみち読めるため、α+γ に対する防御価値の上積みが薄い

### 4-4. RLS / GRANT（migration に 1 セットで書く）

| ロール        | calendar_connections                                                                                                                                                                                                                                               | calendar_connection_calendars |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| authenticated | column-scoped SELECT のみ（`id, user_id, provider, provider_account_email, status, last_synced_at, last_sync_error, created_at, updated_at`。**`refresh_token_enc` / `granted_scopes` / `provider_account_id` は grant から除外**）+ `auth.uid() = user_id` policy | SELECT のみ + 同 policy       |
| service_role  | ALL                                                                                                                                                                                                                                                                | ALL                           |
| anon          | なし                                                                                                                                                                                                                                                               | なし                          |

- 全 mutation（接続作成・カレンダー選択・切断）は tRPC service が `createServiceRoleClient` + 明示的な `user_id` 一致ガードで実行する。ミラーテーブルと同じ「書き込みは service_role 責務」の構図
- 注意: column-scoped grant の下では `select('*')` だけでなく、**未 grant 列を `WHERE` / `ORDER BY` / `EXPLAIN` に含むクエリもすべて 42501 になる**。エラーは列名を出さず `permission denied for table` としか言わない。service 層は明示カラム指定を徹底する
- `user_id` を grant に含めた理由（Step 1 実装時の変更）: JWT で既に既知なので開示はゼロ。除外すると repo 内で 81 箇所使われている `.eq('user_id', …)` idiom が 42501 になる。ローカル検証で「RLS の `USING` 句は呼び出し側の列権限チェックを受けない」ことは実証済み（未 grant の `user_id` を参照する policy が正しく行を絞った）ため grant は必須ではないが、次に触る人の地雷を消すために含める
- §4-3 が挙げる「前例 2 件」はいずれも書き込み側の grant であり、**column-scoped SELECT は本 project が repo 初**
- `pnpm rls:snapshot` を再生成し、drift を CI で検出する。ただし snapshot は SELECT / INSERT / UPDATE / DELETE しか記録せず、しかも生成元は local DB である。production の `pg_default_acl` は新規 public テーブルに anon / authenticated へ `arwdDxtm` を撒く（local は `Dxtm` のみ）ため、**REVOKE 漏れは snapshot でも CI でも検出できない**。migration 自身に `has_table_privilege` / `has_column_privilege` の invariant を書き、production 適用時に落ちるようにする
- 2026-07-16 の [iCal schema drift incident](../../operations/log/2026-07-16-incident-production-ical-schema-drift.md) の規律に従う: 明示 transaction + `lock_timeout = '5s'`、local reset → Supabase Preview Branch 検証 → merge の経路のみ。Dashboard SQL Editor と手動 `db push` は使わない

## 5. OAuth フロー（Google）

### 5-1. 専用 OAuth client（Supabase Auth と分離）

Google Cloud console に **Dayopt 専用の OAuth client（web application）** を作り、scope は `https://www.googleapis.com/auth/calendar.readonly` のみ要求する。

Supabase Auth の Google provider に scope を足す案は却下する。理由: (a) サインイン手段とカレンダー接続が癒着し、email サインインのユーザーが Google カレンダーを接続できなくなる。(b) Supabase Auth は provider refresh token の取得・保管・回転を委ねる設計になっていない（現に versioned `supabase/config.toml` に google provider 定義は無く dashboard 管理）。identity（誰か）と data-access(何を読めるか)は別物として扱う。

### 5-2. Connect フロー

- Route handler 2 本: `apps/product/src/app/api/integrations/google-calendar/start/route.ts` / `.../callback/route.ts`。redirect flow は tRPC 化できないため、`/api/auth/*` と同列の「REST 維持」例外として `.claude/rules/architecture.md` の一覧に追記する
- `start`: session 必須 + billing gate（`canAccessProFeatures` + `isBillingEnforced` を route 内で適用）。`state`（random）と PKCE `code_verifier` を `__Host-` HTTP-only cookie（10 分 TTL）に保存して Google へ redirect。confidential client なので token 交換には client_secret を併用し、PKCE は上乗せ防御
- Auth URL params: `access_type=offline`・`prompt=consent select_account`（refresh token を確実に取得し、接続する Google アカウントを毎回選ばせる）。**`include_granted_scopes` は付けない** — 付けると同一 client が過去に得ていた scope まで畳み込まれ、保存する refresh token が本機能に必要な範囲を超えた権限を持ちうる。callback は `calendar.readonly` の有無しか検査しないため余分な scope は素通りする。必要な scope は最初から全部要求しており incremental auth は使わない（Step 2 レビュー指摘）
- `callback`: state/PKCE 検証 → code 交換 → id_token から `sub` / `email` を取得 → `calendar_connections` を upsert → 初回はカレンダー選択へ誘導する Settings へ redirect
- API client は **googleapis SDK を入れず素の `fetch` + zod パース**。必要な endpoint は token / calendarList.list / events.list / revoke の 4 つだけで、依存追加規律（1 機能のために大きなライブラリを入れない）に従う

### 5-3. Refresh

同期実行のたびに refresh token → access token をサーバー側で mint する。access token は永続化しない。

### 5-4. 再認証

token 交換・API 呼び出しで `invalid_grant` を検知したら `status = 'reauth_required'` に更新し、同期対象から外す。Settings UI に再接続バナーを出す。再接続は connection id を HttpOnly flow cookie に保持し、callback で検証済み Google `sub` が保存済み `provider_account_id` と一致する場合だけ、既存行を条件付き UPDATE して `active` に戻す。generic upsert は使わず、切断との競合で更新行が無ければ失敗させる。

### 5-5. Operational TODO（コードの blocker にしない）

- GCP project の OAuth consent screen 設定、redirect URI 3 系統（production / preview / dev）
- **sensitive scope（calendar.readonly）の Google 審査**。未審査の間は 100 user cap + 警告画面で動作するため pre-launch には十分。公開前に審査を通す
- env 追加: `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` / `CALENDAR_TOKEN_ENCRYPTION_KEY` / `CRON_SECRET` を `apps/product/src/env.ts` に optional で追加し、Stripe と同じ「Vercel production ではペア必須」refine を付ける

## 6. 同期ジョブ設計

### 6-1. 実行基盤（相談事項 → 採用: Option β）

- **Option α（却下）**: pg_cron + `invoke_edge_function` → Supabase Edge Function。橋渡し helper（`20260319000003_vault_invoke_edge_function.sql`）は存在するが未使用で、同期本体を Deno に書くと型・テスト・Sentry・provider adapter を Next.js 側と二重管理することになる。「新規ロジックは TS service 層」の規約とも整合しない
- **Option β（採用）**: **Vercel cron → Next.js route handler**。`vercel.json` に `{"path": "/api/cron/calendar-sync", "schedule": "*/15 * * * *"}` を追加し、route は `CRON_SECRET` の Bearer 検証。同期本体は `features/external-calendar/server/sync-service.ts` に置き、**cron route と tRPC `syncNow` が同一の service 関数を呼ぶ**。solo dev で TypeScript 一枚岩（Sentry・logger・env・zod・Vitest がそのまま効く）、secrets は既に Vercel env に集約済み（Stripe 前例）
- **Option γ（却下）**: on-demand only（アプリを開いた時だけ同期）。カレンダーが古い状態が常態化し、次 phase の ghost 鮮度が壊れる。「stale なら開いた時に kick する」補助は将来の追加候補としてメモに留める

cron route は「due な connection を列挙 → 時間予算内で逐次同期」の薄い dispatcher とし、`maxDuration` を明示する（Vercel plan の上限確認は operational TODO）。`BILLING_ENFORCED` 有効時は `canAccessProFeatures` で非 Pro の connection を skip する分岐を最初から入れる（既定 false の今は全件通る）。

手動同期: (a) connect callback 完了直後とカレンダー選択変更直後に service 直呼びで初回 full sync（ユーザーが待つ導線なので即時）、(b) Settings の「今すぐ同期」= tRPC `syncNow`（`@/lib/rate-limit/upstash` の既存パターンで per-user 制限）。

### 6-2. 同期アルゴリズム（per selected calendar）

Step 3（#1705）実装時に、当初案から 4 点を変更した。理由は各項に記す。実装は `features/external-calendar/server/sync-service.ts` と `providers/google.ts` が正。

1. **初回 full sync**: `events.list?timeMin=now-90d&timeMax=now+90d&singleEvents=true&maxResults=2500` を `nextPageToken` でページング。ページング終了条件は `nextPageToken` の有無だけで判定する（Google は要求より少ない件数を返すので件数で打ち切らない）。**全ページ走破に成功したときだけ** 最終ページの `nextSyncToken` を `calendar_connection_calendars.sync_token` に保存する（途中で落ちたら保存せず、次回また先頭から。upsert は冪等）
2. **増分 sync**: `events.list?syncToken=...`（timeMin/timeMax は併用不可。付けると 410 ではなく 400 が返る）。変更分を upsert key `(user_id, provider, connection_id, provider_calendar_id, provider_event_id)`（**Step 1 で connection_id を含む 5 列に張り替え済み**。当初案の 4 列で書くと対応する一意制約が無く 42P10 で落ちる）で upsert
3. **tombstone は UPDATE**（当初案の「sparse row として upsert」から変更）: provider 側の削除・キャンセル（増分 sync が返す cancelled）と、終日化で取り込み対象外になったイベントは、`status = 'cancelled'` への **UPDATE** で表現する。**ミラーに既にある行だけ**を対象にし、未知 id では行を作らない。
   - 当初案（sparse row upsert）を却下した理由: 増分 sync は「前回以降に削除された全イベント」を返すので、ミラーに無いイベントの cancelled 通知が必ず届く。それを sparse row として INSERT すると `start_at`/`end_at` が NULL の行ができ、§6-2-6 の prune 条件（NULL 比較で UNKNOWN）に**永久に一致しない不滅のゴミ行**になる。しかも ghost 導出は cancelled を除外するので誰にも読まれない。UPDATE なら既存の `title`/`start_at`/`end_at`/`dismissed_at` が残って prune が効き、NULL 時刻の行が構造的に生まれない
4. **410 GONE**（syncToken 失効）: `sync_token` を NULL 化し、**同じ run 内で 1 回だけ** full sync にフォールバックする
5. **410 → full resync 後の mark-and-sweep**（新規項）: full sync は `showDeleted` 既定 false で cancelled を返さないため、provider 側で削除された行が active のまま生き残る。これを塞ぐため、**全ページ走破に成功した full sync run の後にだけ** `(user_id, connection_id, provider_calendar_id)` スコープで `last_synced_at < runStartedAt AND status <> 'cancelled'` の行を cancelled 化する（sweep）。
   - `runStartedAt` は run ごとの単一値で、全 upsert 行の `last_synced_at` と sweep 条件の両方に使う（行ごとに `now()` を使うと sweep 境界がぶれる）。この strict 比較が並行 run 安全性の要でもある（後発 run が書いた新しい `last_synced_at` の行は先発 run の sweep で消えない）ので、lease 列は要らない
6. **dismissed 不可侵**: upsert payload の**キーから `dismissed_at` を必ず除外**する（PostgREST の `ON CONFLICT DO UPDATE SET` の対象列は INSERT の列リストと同一なので、含めなければ既存値が保持される）。加えて **1 upsert バッチ内の全行のキー集合を厳密に揃える**（PostgREST は配列 upsert のとき全行のキーの和集合を `columns` に送り、欠けた行を DEFAULT ではなく NULL で埋めるため、キーが不揃いだと他行の既存値を壊す）。「再同期で dismissed を復活させない」を機械的に保証し、full resync 経由でも復活しない。regression test 必須
7. **window prune（connection 単位で 1 回）**: 1 同期 run の最後に `end_at < now-90d OR start_at > now+90d` の行を削除する（未来側も対象にするのは、syncToken 増分が window 外の変更を持ち込むため）。**calendar ごとではなく connection ごとに 1 回だけ**走らせる（window は時間軸の条件なので calendar 単位に絞る必要がなく、calendar 数だけ走らせると無駄）。plans / records から参照される行は **anti-join で除外**する — `external_calendar_event_id` の FK は ON DELETE 句なし（NO ACTION）のため、参照行の DELETE は例外になる（migration `20260708232500` L40/L62）。**参照判定は `deleted_at` で絞らない**（soft-delete 済みの plan もまだ FK でミラー行を掴んでいるので、絞ると 23503 で落ちる）。実装は keyset ページング（150 件/バッチ）で `max_rows=1000` と URL 長 8192B の両方を避ける
8. **dismissed 行も prune 対象**: window は now 相対で前進するだけなので、window 外に出た行が full resync で再取得されることはなく、resurrection は起こり得ない。window 内の dismissed / cancelled 行は保持する（410 full resync 時の復活防止と増分削除の伝達に必要）
9. **エラー分類**: connection 逐次・calendar 逐次。410 は sweep 付き full resync、401 / refresh の invalid_grant は `status='reauth_required'`、403/429 の usageLimits 系は jitter 付き backoff 1 回 + 次回 cron 送り、それ以外の 403（scope 剥奪・共有解除）と 404 は恒久エラー、400 は実装バグとして capture。`last_sync_error` には provider 生メッセージではなく i18n 可能な安定コード（`reauth_required` / `rate_limited` / `provider_unavailable` / `encryption_key_invalid` / `partial_failure`）を入れる（この列は authenticated が SELECT できる）
10. **未来カバレッジの穴（Step 5 で塞ぐ）**: 増分 sync は「変更されたイベント」しか返さないため、時間経過だけで ±90d window に入ってくる未来イベントはミラーに取り込まれず、prune で消えると再配信されない。Step 3 は `syncConnection({ forceFullSync })` と sweep という**機構**だけ提供し、「カレンダー毎に 1 日 1 回 forceFullSync」という**スケジュール方針**は Step 5（#1707）で決める

### 6-3. 終日（all-day）イベント

MVP では **skip する（timed イベントのみ取り込む）**。ミラーに `is_all_day` カラムが無く、TZ 変換して 00:00-24:00 で入れると ghost / 変換 UX 未設計のまま実データを汚す。ghost project で「TZ midnight 変換」「カラム追加」を含めて再検討する（§15）。

## 7. アプリ構造

### 7-1. Feature 配置

新 feature `apps/product/src/features/external-calendar/` を **Layer 1**（timeblock の peer）として追加する。規約どおり `apps/product/eslint.config.mjs` の Feature Boundary ブロックを先に変更し、`.claude/rules/feature-boundaries.md` を追従させる。

Layer 1 にする理由: 次 phase で Layer 2 の `calendar`（composition hub）が ghost クエリ hook を barrel から import する必要がある。Independent や Layer 2 に置くと DAG 違反になり配置変更のやり直しになる。本 milestone の消費者は settings（DAG 除外）のみだが、次 phase を見た位置を今決める。timeblock / tags への依存は現時点でゼロ。

```
features/external-calendar/
  index.ts          # barrel
  components/       # Settings 用 UI（IntegrationsSettings から合成される）
  server/
    router.ts       # externalCalendarRouter
    connection-service.ts
    sync-service.ts
    token-crypto.ts # AES-256-GCM helper
    providers/
      types.ts      # CalendarProviderAdapter interface
      google.ts     # fetch ベース実装
  schemas/
```

### 7-2. tRPC surface（Router → Service の 3 層、`handleServiceError`）

| procedure                   | gate               | 内容                                           |
| --------------------------- | ------------------ | ---------------------------------------------- |
| `getConnectionAvailability` | protectedProcedure | 現在の origin が設定済み redirect と一致するか |
| `listConnections`           | protectedProcedure | 接続一覧。解約後も自分の接続状態は見える       |
| `getSyncStatus`             | protectedProcedure | connection + calendars の last_synced / error  |
| `listProviderCalendars`     | **proProcedure**   | オンデマンドで provider の calendarList を取得 |
| `updateSelectedCalendars`   | **proProcedure**   | child table 差し替え + 即時 sync kick          |
| `syncNow`                   | **proProcedure**   | rate-limited、sync-service 直呼び              |
| `disconnect`                | protectedProcedure | 解約済みユーザーも必ず切断できる               |

connect start/callback は route handler（§5-2）。ghost 用の `listEvents` / `dismiss` は次 project で追加する（予約席としてここに記す）。ルーターは `lib/trpc/root.ts` に集約。

### 7-3. Settings UI

- `features/settings/constants.ts` の `SETTINGS_CATEGORIES` に第 6 カテゴリ `integrations` を追加し、`SettingsContent.tsx` に `IntegrationsSettings` を合成する。settings は composition feature なので external-calendar の **barrel** から import する（deep import 禁止）
- コンポーネント実体は `features/external-calendar/components/`: 未接続 = connect ボタン（`/api/integrations/google-calendar/start` へ）。接続済み = 複数アカウントの email・カレンダー checklist・最終同期 + status/error・今すぐ同期・切断・`reauth_required` 時の同一アカウント再接続バナー
- `getConnectionAvailability` は設定値を返さず boolean だけを返す。現在の origin が redirect URI allowlist と一致しない Preview や、credentials 未設定環境では接続・追加・再接続 CTA を無効にする
- Settings 所有の iCal セクションは既存 token から feed URL を表示・コピーし、再生成時だけ確認する。CSV export は危険な数式 prefix を文字列化する。iCal route の query/window と JSON restore の仕様は変えない
- i18n: **orphan 状態の `settings.integrations` キー（en/ja）を接続し、不足分を追加**する（i18n skill / glossary 準拠）
- Storybook: AllPatterns story 必須（未接続 / 接続済み / reauth_required / エラー）

### 7-4. Provider abstraction（Outlook が schema 変更なしで刺さる証明）

`server/providers/types.ts` に最小 4 操作の interface を切る:

```ts
interface CalendarProviderAdapter {
  exchangeCode({ code, redirectUri, codeVerifier }): ProviderConnectionIdentity
  startSession(refreshToken): ProviderSession   // run 先頭で 1 回だけ access token を mint
  listCalendars(session): ProviderCalendar[]
  syncCalendar(session, { calendarId, cursor | null, window }): SyncCalendarResult
  revoke(refreshToken): boolean // best-effort。失効が確定したら true
}

// SyncCalendarResult は当初案の 3 フィールドから 2 つ拡張した（実装は providers/types.ts が正）
type SyncCalendarResult = {
  events: NormalizedExternalEvent[]   // 取り込む timed イベント
  cancelledEventIds: string[]         // provider 側で削除・キャンセル（増分のみ）
  skippedEventIds: string[]           // 終日など取り込み対象外（§6-3）
  nextCursor: string | null
  cursorInvalid: boolean
  usedFullSync: boolean               // sweep を撃ってよいかの判断に使う
}
```

- `NormalizedExternalEvent` はミラーのカラム（provider_event_id / title / description / start_at / end_at）に対応。`status` は sync-service が付ける
- **`cancelledEventIds` / `skippedEventIds` を分けた理由**: `events` だけでは「provider 側で消えた」と「こちらの都合で取り込まない」を sync-service から区別できない。とくに timed → 終日に変更されたイベントを skip で握り潰すと古い timed 行が幽霊として残るので、`skippedEventIds` で §6-2-3 の tombstone 対象に回す
- **`startSession` を切った理由**: 当初案の `listCalendars(refreshToken)` / `syncCalendar(refreshToken, ...)` は呼び出しのたびに token 交換が走り、カレンダー N 個で N+1 回の refresh になる。§5-3 の「同期実行のたびに mint」は run 単位の話なので、run 先頭で 1 回だけ mint して session を使い回す。rotation された refresh token は `ProviderSession.rotatedRefreshToken` で返し、sync-service が保存し直す
- `cursorInvalid` が Google の 410 と Microsoft Graph の delta 失効を共通表現する
- Outlook 追加時に必要なのは `providers/microsoft.ts` + OAuth route 1 組のみ。**schema 変更ゼロ**（ミラー・connections とも `provider` は free text、Graph の deltaLink は `sync_token` text に収まる）
- adapter の選択は `provider` の switch で足りる。汎用 registry / sync framework は作らない（§11）

## 8. 切断・削除セマンティクス

disconnect は次の 3 段で行う:

1. provider の revoke endpoint を best-effort で呼ぶ（失敗しても続行し、ログに残す）
2. `calendar_connections` 行を hard delete（child は CASCADE）
3. ミラー行のうち **plans / records から参照されていないものだけ** anti-join で delete（dismissed 含む）

- 変換済み plans / records と、それが参照するミラー行は**残す**。これは選択であると同時に制約でもある: FK NO ACTION のため参照行は消せず、`SET NULL` 化も `(source='external_calendar') = (external_calendar_event_id IS NOT NULL)` の biconditional CHECK + source 不変 trigger に阻まれる。過去の記録の由来（歴史的アンカー）として残るのは設計意図とも一致する
- 再接続すると、以前 dismiss していた予定が ghost として再登場しうる（dismissed 行ごと削除するため）。**切断 = 状態リセットの意思表示**とみなし、このトレードオフを許容する
- soft-delete（`disconnected` status で行を残す）は却下: token を保持し続ける secret 面の拡大に見合う要件が無い

## 9. Reversibility Table

| 項目                                              | タグ      | 備考                                                         |
| ------------------------------------------------- | --------- | ------------------------------------------------------------ |
| calendar_connections / child テーブル追加         | [hours]   | DB migration。preview branch 検証 → 適用。drop で戻せる      |
| OAuth client・redirect URI・審査などの GCP 側設定 | [hours]   | 外部設定だがすべて取り消し可能                               |
| env 追加（client id/secret・暗号鍵・CRON_SECRET） | [hours]   | Vercel env + env.ts。削除で戻せる                            |
| vercel.json への cron 追加                        | [hours]   | 削除で戻せる                                                 |
| 同期エンジン・adapter・tRPC・Settings UI          | [minutes] | 純粋なコード変更。git revert で戻せる                        |
| ミラーへのデータ流入                              | [minutes] | ミラーは導出データ。全行 delete + full resync で再構築できる |

**`[irreversible]` は本 project にゼロ**。公開 URL・公開契約・データ破壊を伴う step が無い（iCal export には触れない）。強い正当化を要する項目は無い。

## 10. Existing Code to Reuse

- `supabase/migrations/20260708232500_add_time_model_tables.sql` — ミラーの RLS / column-scoped grant / owner constraint trigger / `update_updated_at()` のパターン。新 2 テーブルはこの migration の書式を踏襲する
- `supabase/migrations/20260705070000_restrict_profiles_billing_column_grants.sql` — column-scoped grant の前例（token 列の遮断に同型を使う）
- `apps/product/src/lib/supabase/oauth.ts` の `createServiceRoleClient` — service_role 書き込み経路（iCal feed route で実績あり）
- `apps/product/src/lib/trpc/procedures.ts` の `proProcedure`（L149）— 課金ゲートマーカー。`BILLING_ENFORCED` off 時は素通り
- `packages/billing` の `canAccessProFeatures` / subscription status mapping — cron dispatcher の課金フィルタ
- `apps/product/src/lib/rate-limit/upstash.ts` — `syncNow` の per-user rate limit（iCal feed の前例）
- `apps/product/src/env.ts` — Stripe の「Vercel production ではペア必須」refine 書式を Google credentials に流用
- `apps/product/messages/en/settings.json` / `ja` の orphan `settings.integrations` キー群 — Integrations UI の文言下地
- `apps/product/src/features/timeblock/schemas/timeblock.ts` L20 ほか — `externalCalendarEventId` の受け皿（変換 UX の次 project でそのまま使う）
- project skills: `trpc-router-creating` / `supabase` / `security` / `test` / `i18n` / `storybook` / `store-creating`（該当時）

## 11. What I'm Not Doing

- **双方向同期（Dayopt → Google 書き込み）** — one-way import + 既存 iCal export で足りる（ADR-025 / time-model-split §10 の決定を維持。ゼロベースで再検討した結果も同じ）
- **ghost 表示・Plan/Record 変換 UX** — 次 project `external-calendar-ghost`（仮名）。§12 のスケッチを出発点にする
- **Outlook（Microsoft Graph）実装** — adapter interface と schema 互換性だけ担保し、実装は別 project。同期エッジケース・OAuth 審査を 1 provider に絞る
- **webhook push channel（Google push notifications）** — 15 分 polling で十分。push は HTTPS endpoint の TTL 管理という新しい運用面を持ち込むため、鮮度要求が上がってから
- **iCal export URL の表示 UI** — tRPC・i18n キーとも完成済みで cheap だが「ついで」に該当。独立 small task（1-2 commit）として別 issue 化する
- **汎用 sync framework / provider registry** — provider 想定が 2 つの段階で 3+ 呼び出し点が無い。switch で足りる
- **ミラーの Realtime 購読** — ghost 表示が無い本 phase では不要。次 project で必要になってから判断する

## 12. Ghost UX スケッチ（次 project への引き継ぎ、本 project では実装しない）

- **表示**: `externalCalendar.listEvents`（導出条件「ミラー − 参照済み − dismissed − cancelled」を service 層のクエリで表現）を `useCalendarData` の第 3 のクエリとして並べ、calendar grid に read-only の ghost カード（`PlanLaneCard` の亜種。点線 / 半透明の方向、EXCLUDE 対象外なので重なり描画が必要）
- **変換**: ワンタップで Plan / Record を作成。受け皿は完成済み（`plans/records.external_calendar_event_id` + `source='external_calendar'`、app 側 schema も受け入れ済み）。自動確定は禁止（strategy §4-3）
- **dismiss**: 既存の `UPDATE(dismissed_at)` column grant がそのまま使える（authenticated の直接更新で成立。tRPC mutation を薄く被せる）
- 変換後に provider 側でイベントが変わってもミラーだけ更新し、変換済み plan/record は触らない（Phase 1 決定の再掲）

## 13. Step 構成

1 Step = 1 PR。各 Step で事前調査プロンプトを使い、複雑 Step（1・3）は step-X-detail.md を作る。

| Step | 内容                                                                                                                                                                            | Reversibility | commits |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- |
| 0    | 本設計書の作成・合意（Issue #1562 の成果物）                                                                                                                                    | [minutes]     | 1       |
| 1    | Migration: 新 2 テーブル + RLS/GRANT/trigger 一式、`supabase/schemas` 宣言ミラー、`pnpm rls:snapshot` 再生成                                                                    | [hours]       | 1-2     |
| 2    | OAuth connect: env 4 変数（redirect URI allowlist を含む）、token 暗号 helper、start/callback route、feature scaffold + eslint.config.mjs DAG 追加。GCP 設定は operational TODO | [hours]       | 4-6     |
| 3    | Provider adapter（google）+ sync-service（full/incremental/410/tombstone/prune）+ Vitest（dismissed 不可侵・prune anti-join の regression test 必須）                           | [minutes]     | 2       |
| 4    | tRPC router + service（§7-2 の 7 procedure、proProcedure 付与）                                                                                                                 | [minutes]     | 1       |
| 5    | Vercel cron: vercel.json + `/api/cron/calendar-sync`（CRON_SECRET 検証・時間予算・課金フィルタ hook）                                                                           | [hours]       | 1       |
| 6    | Settings UI: integrations カテゴリ + Google 接続/再接続 UI + iCal URL 管理 + CSV export 安全化 + i18n + Storybook                                                               | [minutes]     | 3       |
| 7    | Hardening + 完了処理: Sentry capture 整備、`summary.md` + `status: done`、user docs は docs-writing skill で提案                                                                | [minutes]     | 1       |

計 11-12 commits。マイルストーン「連携ができる」は Step 6 で到達し、Step 7 で締める。auth / RLS / OAuth / cron を扱うため、Step 1・2・5 は `risk-reviewer`、挙動変更は `behavior-verifier` の自動委任対象。

## 14. 完了条件（Definition of Done）

1. Settings → Integrations から Google 接続 → カレンダー選択 → 手動同期で `external_calendar_events` に行が入る（**localhost と production で実カレンダー確認**。Preview では OAuth 接続を無効にしている。Google は redirect_uri の完全一致を要求しワイルドカードを許さないので、deploy ごとに変わる Preview URL は GCP に登録できない。加えて `__Host-` cookie は発行ホストにしか送られないため、cookie ホストと redirect_uri ホストがずれて必ず失敗する。Step 2 で決定）
2. Vercel cron が 15 分毎に増分同期し、provider 側の変更・削除がミラーに反映される
3. 切断で token が破棄され、未参照ミラー行が消える。変換受け皿（FK）に違反が出ない
4. `reauth_required` への遷移と再接続導線が動く
5. `pnpm rls:snapshot` drift なし、`pnpm check` pass、dismissed 不可侵・prune anti-join の regression test が存在する
6. Calendar 画面には何も表示されない（ghost は次 project の出発点として §12 が残っている）

## 15. 未決事項（次 project へ持ち越し）

1. ghost の視覚表現と有効期限の挙動（principles.md L94 と同期）
2. provider が展開した recurrence instance の取り込み粒度（singleEvents 展開以上の扱い）
3. ghost 経由 API 書き込みの `confirmed` 相当フラグの是非
4. 終日イベントの本対応（skip 解除の方式: TZ midnight 変換 or `is_all_day` カラム追加）
5. Free/Pro 境界の最終決定（#1336 の領域）
