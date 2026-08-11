---
status: current
last_verified: 2026-08-12
code:
  - supabase/config.toml
  - supabase/migrations
  - scripts/generate-rls-snapshot.ts
  - docs/engineering/infra.md
---

# 復元演習（restore drill）手順書

**この文書は「演習のやり方」を持つ。事故が起きた時に読む復旧手順は [infra.md §災害復旧手順](../engineering/infra.md#災害復旧手順) が正本。**

3 つの文書の役割が紛らわしいので先に区別する。

| 文書                                                              | 何のため                                   | いつ読む             |
| ----------------------------------------------------------------- | ------------------------------------------ | -------------------- |
| [infra.md §DB Migration Rollback 手順書](../engineering/infra.md) | **判断の巻き戻し**（migration を戻す）     | 自分の変更が原因の時 |
| [infra.md §災害復旧手順](../engineering/infra.md)                 | **事故からの復旧**（データ消失・オペミス） | 障害対応中           |
| 本文書                                                            | **平時の演習**（復旧経路が本当に動くか）   | 演習日               |

テストしていないバックアップは「あるつもり」でしかない。この演習の目的は、復元が**できること**の確認ではなく、**どれだけ失われ、どれだけ時間がかかり、何が復元されないか**を数値と一覧で確定させることにある。

> **演習の完了は paid billing 有効化の前提条件**（epic [#1669](https://github.com/Dayopt/dayopt/issues/1669) のゲート）。課金を始めると、失うデータに他人のお金が乗る。

---

## 演習前に確定していないこと

**この手順書は演習前に書かれている。以下は未確認のまま残っており、Step 0 で確定させる。** 確認するまで、後続 Step の所要時間・可否は見積りでしかない。

| 未確認事項                                                       | なぜ未確認か                                                                                 | 確定させる場所    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| 現行プランと backup 種別（daily / PITR）、保持期間、直近成功時刻 | Management API の project endpoint は backup 情報を返さない（2026-08-12 実測）               | Dashboard（User） |
| daily backup が **logical / physical** のどちらか                | 方式によって復元経路が変わる。project 作成が 2025-12-23 と新しいため physical の可能性が高い | Dashboard（User） |
| `supabase branches create --with-data` が実在するか              | CLI reference には記載があるが Branching guide は「data-less」と書いており、公式内で矛盾     | `--help` の実出力 |
| pg_cron の `cron.job` が復元を跨いで残るか                       | 公式ドキュメントに記載が無い                                                                 | 演習中の実測      |
| production の cron job の実数                                    | baseline に「本番は Dashboard で設定」とあり、repo が正本でない                              | Step 0 で控える   |
| `auth` schema が復元対象に入るか（経路により異なる）             | 物理復元は cluster 単位なので入るはず。論理 dump は既定で除外                                | 演習中の実測      |
| production DB の実サイズ                                         | RTO はサイズにほぼ比例する                                                                   | Step 0 で計測     |

**空欄のまま infra.md へ数値を書かない。** 測っていない RTO / RPO を復旧手順書に書くのは、無いより危険（障害中にその数値を信じて判断される）。

---

## Step 0: 事前確認（User 操作。演習日の前に済ませる）

Main は Dashboard と課金設定に触れない。ここは User の一次情報。

### 0-1. Supabase Dashboard で確認する

Dashboard → Project `dayopt` → Settings / Database → Backups

- [ ] 現在のプラン（Free / Pro / Team）
- [ ] daily backup の**有無・保持日数・直近の成功時刻**
- [ ] backup 方式が **logical / physical** のどちらか（画面に "Restore" ボタンがあるか、CLI 手順へ誘導されるか）
- [ ] PITR が有効か無効か
- [ ] DB サイズ（Reports → Database、または `SELECT pg_size_pretty(pg_database_size(current_database()));`）
- [ ] **復元前の production の状態を控える**（復元後の比較対象がこれしかない）
  - `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
  - `plans` / `records` / `tags` / `profiles` の行数と、各テーブルの最新 `created_at`

**Free プランなら backup は存在しない。** その場合この演習は「backup を作るところ」から始まる（`db dump` の定期実行 + 保管先の決定）。

### 0-2. PITR の費用と復旧可能範囲（判断は User）

| 項目             | daily backup     | PITR                                           |
| ---------------- | ---------------- | ---------------------------------------------- |
| 失う最大時間幅   | **最大 24 時間** | **約 2 分**（WAL の archive 間隔）             |
| 月額             | プランに含まれる | **$100（7 日）/ $200（14 日）/ $400（28 日）** |
| 併用             | —                | **有効化すると daily backup は停止する**       |
| spend cap の対象 | —                | **対象外**（上限で止まらない）                 |

出典は Supabase 公式の [Manage PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)。**価格は変動するので演習日に再確認する。**

判断材料は「24 時間分の予定・記録を失って許されるか」。課金開始前の現在は許容できる可能性があるが、**課金後は他人のお金が絡むため基準が変わる**。有効化するかは User の判断。

### 0-3. CLI の実挙動を確認する（Main が実行可）

```bash
supabase branches create --help
```

`--with-data` が存在するかを**実出力で**確認する。ドキュメントは信用しない（公式内で矛盾している）。

### 0-4. 必要な権限・準備物

| 要るもの                            | 誰が持つか | 用途                                   |
| ----------------------------------- | ---------- | -------------------------------------- |
| Supabase Dashboard のログイン       | User       | backup 状態確認、restore 実行          |
| Supabase 組織の課金設定へのアクセス | User       | PITR 有効化の判断・実行                |
| production の DB 接続情報           | User       | 案γ で dump を取る時だけ               |
| 1Password `Dayopt-Production`       | User       | 上記 credential の取り出し             |
| `supabase` CLI（ログイン済み）      | 共通       | dump / branches / functions            |
| `rclone` または S3 クライアント     | 共通       | Storage オブジェクトの搬出（案による） |
| Stripe Dashboard（**test mode**）   | User       | 復元後の billing 確認                  |

---

## 演習対象の選択

**production を復元対象にしない。** 復元先は必ず branch / 新規 project / local のいずれか。

| 案                             | 復元先         | 費用 | 何を証明するか                                       | 未解決リスク                                                                                                                                                         |
| ------------------------------ | -------------- | ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **α** branch へ複製            | preview branch | 低   | branch 経路                                          | `--with-data` の実在が未確認。加えて 2026-08-11 に作った branch は 2 本とも `MIGRATIONS_FAILED`（[#1461](https://github.com/Dayopt/dayopt/issues/1461)、原因未特定） |
| **β** backup を新規 project へ | 新規 project   | 中   | **実際の DR 経路**。データが Supabase 境界内に留まる | project 作成が要る。physical backup だと Dashboard restore が使えない可能性                                                                                          |
| **γ** 論理 dump を local へ    | local Postgres | ゼロ | 論理復元の手順が通ること                             | 実データを落とすと**顧客 PII のローカル複製**が発生する                                                                                                              |

### 推奨

**γ を synthetic データで先に通し（= dry run）、その後 β を本番経路の証明として 1 回実行する。**

- α は前提が 2 つとも壊れている（`--with-data` 未確認 + branch が migration に失敗する既知不具合）ので**初回演習では採らない**。#1461 が解決したら再評価する
- γ を**実データで**回すのは既定で採らない。schema + roles だけを実データから取り、データ本体は `pnpm db:fresh` の seed で代用する。実データ複製が要ると判断した場合は User の明示判断とし、演習後に dump ファイルを削除するところまで手順に含める
- β は「本当に戻せるか」を答える唯一の案なので、**最終的に 1 回は通す**

---

## Step 1: dry run（案γ / synthetic データ / ゼロコスト）

目的は**手順を枯らすこと**。ここで詰まった箇所は Step 2 でも詰まる。

### 1-1. 論理 dump を取る

`supabase db dump` は既定で **schema のみ**、かつ `auth` / `storage` / extension 由来 schema を**除外**する。完全な論理バックアップは 3 本に分かれる。

```bash
supabase db dump --db-url "$DB_URL" --role-only -f roles.sql
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f data.sql
```

> **credential を標準出力へ出さない。** 接続文字列は環境変数へ直接読み込み、値を echo しない。Management API / CLI の出力を見る時は [secrets.md §API 経由の設定読戻し](./secrets.md) の **allowlist 射影**に従う。denylist（危なそうな名前を隠す）方式は 2026-08-11 に実際に破綻している（判定語が `password` で実キー名が `db_pass` だった）。`supabase branches get` は credential を JSON で返す command なので、状態確認には `branches list` を使う。

### 1-2. local へ復元して確認する

```bash
pnpm db:reset          # 空の local DB
# roles.sql → schema.sql → data.sql の順に適用
```

### 1-3. 観測ポイント（Step 2 でも同じものを見る）

各項目の**所要時間も測る**。合計が RTO の下限になる。

---

## Step 2: 本番経路の演習（案β）

1. Step 0 で確認した backup（daily / PITR）から**新規 project へ** restore する
2. 復元完了時刻を記録する
3. 下記チェックリストを上から実行する
4. 確認が終わったら**新規 project を削除する**（費用を止める）

**production の restore ボタンは押さない。** in-place restore は破壊的で、実行中プロジェクトは停止する。

---

## 復元後チェックリスト

復元先で上から実行する。1 つでも落ちたら、その時点の状態を記録してから次へ進む（止めない — 何が落ちるかの一覧を作るのが目的）。

### データ

- [ ] `plans` / `records` / `tags` / `profiles` の行数が復元元と一致する
- [ ] 最新行の `created_at` を見て、**実際に失われた時間幅（RPO）** を算出する
- [ ] `mcp_mutation_receipts` / `oauth_connections` など MCP 系テーブルが揃っている

### 権限（機械判定できる）

```bash
pnpm rls:snapshot        # 復元先に対して再生成
pnpm rls:snapshot:check  # drift ゼロが合格
```

期待値は [rls-snapshot.md](../engineering/data/db/rls-snapshot.md) の現行値（policy 43 / RLS 有効テーブル 20 / GRANT 215 / storage policy 8 / Realtime publication 0）。**演習日に本番側の数値を取り直してから比較する**（この数値は 2026-08-12 時点）。

- [ ] `authenticated` に余分な権限が復活していない
- [ ] custom role の password は**復元されない**（仕様）。必要なら再設定する

### RPC

- [ ] `confirm_day_plans_to_records`
- [ ] `soft_delete_record` / `restore_record`
- [ ] `revoke_oauth_connection`
- [ ] `SECURITY DEFINER` と `search_path` の設定が保たれている

### Realtime

```sql
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

- [ ] **0 行が期待値**（Dayopt は Realtime を使っていない）。行が増えていたら復元先の設定ミス

### pg_cron（**未確認事項。ここで答えを出す**）

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

**repo は production の cron job の正本ではない。** baseline migration に「本番は Dashboard で設定」と明記されており（`supabase/migrations/00000000000000_baseline.sql:1298`）、migration に現れない手動 schedule が production に存在しうる。

- [ ] **復元する前に production 側の `cron.job` を控える**（これをやらないと比較対象が無い）
- [ ] 復元後の job 一覧が、控えた production 側と一致するか記録する
- [ ] repo の migration から導ける active job は **2 本**（`cleanup-product-events` / `expire-calendar-revoke-outbox`）。baseline の 4 本はいずれも後続 migration で unschedule 済み。**production の実数がこれと違っても異常ではない** — Dashboard 設定分の差なので、その差自体を記録する
- [ ] 残っていない場合、再作成の手順を本文書へ追記する

### Auth

- [ ] `auth.users` の件数が一致する（**経路依存**: 物理復元は cluster 単位なので入るはず、論理 dump は既定で除外）
- [ ] ログインが実際に通る
- [ ] `send-auth-email` の Auth Hook 設定（`verify_jwt = false`）が保たれている

### Edge Functions（**復元対象外。手動で戻す**）

- [ ] `send-auth-email` を再デプロイする（`--use-api` 必須）

**正本は `supabase/functions/` と `supabase/config.toml` の `[functions.*]` 宣言。** 現在の実体は `send-auth-email` の 1 本だけ。

### Storage（**どの backup にも入らない**）

- [ ] `avatars` / `attachments` バケットが存在する（バケット定義は migration に入っているので schema と一緒に戻る）
- [ ] **オブジェクト本体は空**であることを確認する。これは異常ではなく仕様
- [ ] オブジェクトの搬出・復元は S3 互換エンドポイント経由（`rclone copy` 等）。**Storage には versioning が無く、削除は復元不可**

### Vault / 秘密情報

- [ ] `vault.secrets` の値が読めるか確認する。同一 project 内の復元は暗号鍵が同じなので読めるはず。別 project へ復元した場合は要確認
- [ ] `PLACEHOLDER_REPLACE_ME` のままの行が無いか確認する（migration の seed 値）

### 課金（Stripe / **test mode で行う**）

- [ ] `profiles.stripe_customer_id` / `subscription_status` / `subscription_id` が保たれている
- [ ] `stripe_webhook_events` の履歴が残っている
- [ ] Stripe test mode で checkout 相当のデータを作り、復元後の DB に対して **webhook resend** が通る
- [ ] **test / production mode を取り違えない**

### アプリ主要フロー

復元先を向いたアプリを起動して実行する。

- [ ] `/api/health` が 200 を返す
- [ ] ログイン → 予定作成 → 記録確定
- [ ] Calendar / Review / Account / Billing の各画面が表示される

---

## 復元されないもの（確定リスト）

演習で覆るまで、**以下は「戻らない」前提で運用する**。

| 対象                        | 状態                                      | 戻し方                      |
| --------------------------- | ----------------------------------------- | --------------------------- |
| **Storage オブジェクト**    | どの DB backup にも入らない               | S3 互換経由で別途搬出・復元 |
| **Edge Functions**          | 復元対象外                                | `--use-api` で再デプロイ    |
| **custom role の password** | 復元されない（仕様）                      | 再設定                      |
| **Realtime publication**    | 別 project へ復元した場合は再有効化が必要 | 現状は空なので影響なし      |
| **extension の有効化**      | 別 project へ復元した場合は再有効化が必要 | 演習で実測する              |

---

## 実測記録（演習日に埋める）

**空欄のまま infra.md へ転記しない。**

```yaml
drill_date: 'YYYY-MM-DD'
target: 'α branch | β new project | γ local'
source_backup: 'daily YYYY-MM-DDTHH:MM:SSZ | PITR <timestamp>'
backup_kind: 'logical | physical'
db_size: '<GB>'
rto_measured: '<復元開始から主要フロー通過までの実時間>'
rpo_measured: '<失われた最大時間幅>'
storage_objects_restored: false
edge_functions_redeployed: ['send-auth-email']
cron_jobs_before: '<復元前に控えた production の job 数と名前>'
cron_jobs_after: '<復元後の job 数と名前>'
auth_users_restored: '<yes|no>'
vault_secrets_readable: '<yes|no>'
failures: []
operator: '<name>'
```

---

## 中止条件

次のいずれかで演習を止め、状態を記録する。

- 復元先が production project になっている（**即座に中止**）
- credential が標準出力・ログ・Issue・PR のいずれかへ出た（[secrets.md](./secrets.md) の対応へ）
- 案γ で実データの dump ファイルが意図せず作られた（削除まで実施）
- Stripe を production mode で操作していた
- 復元先の DB が production を向いた状態でアプリを起動した

---

## 演習後にやること

1. **実測値を [infra.md §災害復旧手順](../engineering/infra.md#災害復旧手順) へ反映する**（RTO / RPO / 復元されないもの）
2. 記録を `docs/operations/log/YYYY-MM-DD-restore-drill.md` に残す
3. 本文書の「演習前に確定していないこと」の表を、**確定した事実で置き換える**
4. 新規 project / branch / dump ファイルを削除する
5. [#1879](https://github.com/Dayopt/dayopt/issues/1879) を閉じ、epic [#1669](https://github.com/Dayopt/dayopt/issues/1669) のゲート充足を報告する

## 演習の頻度

Supabase 公式に DR 演習のガイダンスは無い。自前で決める。

**初回は課金開始前に 1 回。以後は年 1 回、および DB schema の大規模変更後。** 頻度を上げるより、1 回を実測付きで通す方が価値がある。
