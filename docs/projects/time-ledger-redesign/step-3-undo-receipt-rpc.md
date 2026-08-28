---
status: current
last_verified: 2026-08-28
code:
  - supabase/migrations/20260828030000_add_ledger_undo_receipt_rpc.sql
  - apps/product/src/lib/test/integration/undo-receipt-rpc.integration.test.ts
  - apps/product/src/lib/test/integration/user-data-purge-enumeration.integration.test.ts
  - docs/engineering/invariants.md
---

# time-ledger-redesign — Step 3: Undo receipt RPC（[#2434](https://github.com/Dayopt/dayopt/issues/2434)）

[overview.md](./overview.md) §6 の 8 段依存順の **第3段**。第2段
（[step-2-expand-only-schema-foundation.md](./step-2-expand-only-schema-foundation.md)）が
構造のみで敷いた Undo receipt substrate に、書き込み経路（SECURITY DEFINER RPC 3 本）を
実装した成果物。

本書の役割は棚卸しの記録。設計の理由そのものは
`supabase/migrations/20260828030000_add_ledger_undo_receipt_rpc.sql` のコメントが正本で、
ここでは複製しない。

## 入口4点の裁定（Codex A レビュー、issue #2434 コメント 2026-08-28）

指揮台の設計レビューが「この4点が決まる前にテーブル列と apply RPC の詳細設計へ進むべきではない」
と警告した論点。plan の第一成果物として先に確定した。

### 1. 権限 snapshot と inverse capability

`undo_receipts` に `origin_scopes_snapshot TEXT[]`（receipt 作成時点の
`oauth_connections.scopes` の固定コピー）と `had_origin_connection BOOLEAN`（作成時に
origin_connection_id が非 NULL だったかを固定）を追加した。

`origin_connection_id` の複合 FK は `ON DELETE SET NULL`（第2段で敷設済み）であり、connection
が retention cleanup（`20260810085241_bound_oauth_connection_cleanup_cascade.sql`）で物理削除
されると NULL に落ちる。`had_origin_connection` が無いと、この NULL 化を「UI 由来（scope 制約
なし）」と誤認する穴になる（実際 plan-critic の反証で「retention cleanup の唯一の物理削除経路」
と確認した上でこの設計を採用した）。

Undo に要る scope は「元操作の逆操作が要求する scope」とした: update effect の undo（書き戻し）
は `write:*`、insert effect の undo（DELETE）は `delete:*`。理由は「元操作の記録時点の権限上限
に、その逆操作を行う権限が含まれていたか」を問うのが T4 の意図に忠実なため。

### 2. definer RPC の caller 境界

既存 domain command RPC 群（`create_plan_command_v1` 等）と同型にした:
`REVOKE ALL FROM PUBLIC,anon,authenticated` + `GRANT EXECUTE TO service_role` のみ。RPC 内部
でも `private.assert_timeblock_service_role_request_v1()`（既存関数、
`20260729073122_mcp_stage1_user_write_serialization.sql`）を呼び、GRANT 片落ちに対する
defense-in-depth を持つ。

**risk-reviewer の反証で発見した欠落を採用**: 通常 writer と同じ
`private.lock_timeblock_user_write_shared_v1(p_user_id)` を record/apply 両 RPC が取る。これを
取らないと、account purge の exclusive lock との排他が効かず、Undo だけが repo 全体の writer
境界の外に出る（既存の全 Plan/Record command RPC は例外なくこの lock を取っている）。

`authenticated` への EXECUTE は本段でも開けない。第2段の理由（一度開けた読み取り契約は戻せない、
現時点で読み手が無い）がそのまま適用できる。UI は tRPC 経由でこの RPC を呼ぶ想定。

### 3. PII payload と冪等 tombstone の分離

`undo_receipts`（親）は PII を持たない（`command_name` は固定文字列、他は ID/timestamp）。PII は
`undo_receipt_field_changes.before_value`/`after_value` にのみ存在する。

account-preserving purge（`delete_all_user_data_command_v4`）の対象を「`undo_receipts` の
DELETE」から「`undo_receipt_effects` の DELETE」へ変更した。effects の DELETE は CASCADE で
field_changes も消し PII を除去する。**`undo_receipts` 親行は残し**、`UNIQUE(user_id,
operation_id)` を遅延再送への冪等ガードとして再利用する（新しい tombstone 専用テーブルは
作らない）。

plan-critic の反証で、現行 purge は実は「`undo_receipts` を plans/records より**先に**削除する」
順序になっており、「receipt は残るが effect が消える」状態は account purge 単体では発生しない
ことを確認した（この設計変更は「バグ修正」ではなく「tombstone 化という意図的な挙動変更」）。

### 4. insert・delete 固有の CAS 契約

- **update**: masked field の現在値 == `after_value` を全 field で確認してから
  `before_value` へ戻す。1 つの UPDATE 文の WHERE 句に CAS を埋め込み、行ロックと比較を単一
  atomic 操作にする（`GET DIAGNOSTICS ROW_COUNT` で CAS 成否を判定）
- **insert（undo = 対象行の DELETE）**: 同じ CAS チェックを DELETE の WHERE に使う。ただし
  insert effect を記録する command は field mask に作成時の全フィールドを含める契約とする
  （部分マスクで削除すると mask 外のフィールドごと消えるため）
- **delete（原操作が物理 DELETE）**: **実装しない。** `undo_receipt_effects` →
  `plans`/`records` の複合 FK が `ON DELETE CASCADE` のため、「effect 記録 → 対象行 DELETE」の
  順で書くと、同一トランザクション内で自分が insert した effect 行が自分の DELETE で即座に
  cascade 削除され、記録が自身の記録トランザクションを生き残れない（構造的欠陥）。T2
  （[step-1 doc](./step-1-technical-contract-freeze.md#t2-中央トリム時の-identity分裂時の-idfulfillmentprovenance-の帰属)）
  を実測確認: trim（第4段の最初の consumer）は分裂（update + insert）のみを生成し、物理
  DELETE を発生させないため、この欠落は第4段をブロックしない。将来 hard-delete command を作る
  段で FK 設計ごと再検討する

## 第2段からの申し送り: effect が欠損した receipt

`undo_receipts` に `recorded_effect_count SMALLINT`（作成トランザクション内で DB 側が
`COUNT(*)` して確定、アプリ入力は信頼しない）を追加し、apply 時・list 時の両方でこの値と現在の
effect 数を再照合する。不一致なら apply を拒否し、一覧からも除外する。

この 1 つの機構が、単発の物理削除（部分欠損）と account purge 後の tombstone（全欠損）の両方を
同じ判定で拾う。ticket 本文の 2 択（「一覧から除外する」か「apply 時に再照合する」か）は、両方を
同じ列で実現する形で決着した。

## 実装したもの

| 実装                                                  | 役割                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| additive 列 3 つ（`undo_receipts`）                   | 権限 snapshot・欠損検査の基盤                                          |
| `field_name` allowlist CHECK                          | Undo 対象を `title/note/start_at/end_at/skipped_at/deleted_at` に限定  |
| `private.record_undo_receipt_v1` / `public.*`         | receipt + effects + field_changes を 1 トランザクションで記録（冪等）  |
| `private.apply_undo_receipt_v1` / `public.*`          | 権限交差判定 → 欠損検査 → 正準順 CAS 適用（all-or-nothing）            |
| `private.list_undoable_receipts_v1` / `public.*`      | TTL 内・未 Undo・欠損なしの一覧                                        |
| function-level EXECUTE 不変条件（DO ブロック）        | anon/authenticated が 3 RPC へ EXECUTE を持たないことを機械的に固定    |
| purge 対象の変更（`delete_all_user_data_command_v4`） | `undo_receipts` DELETE → `undo_receipt_effects` DELETE（tombstone 化） |

## 各段へ残したもの

| 残したもの                                | 担当段                        | 理由                                                                           |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `effect_kind = 'delete'` の実装           | 将来 hard-delete command の段 | CASCADE 設計と構造的に矛盾する（上記参照）                                     |
| Undo の UI（ボタン・toast・一覧表示）     | 第4段以降                     | 本段はサーバー側 RPC のみ                                                      |
| `authenticated` への GRANT 開放           | 未定                          | 読み手が無いまま開けると不可逆な契約確定になる                                 |
| field_name allowlist の拡張               | 実需が出た段                  | `tag_id`/`external_calendar_event_id` 等は FK/trigger 制約が絡む               |
| TTL の具体値                              | 第4段（trim command）         | issue 本文どおり設定値として外出し。RPC は `p_undo_ttl_seconds` を引数で受ける |
| receipt の TTL 経過後クリーンアップ（GC） | 未定                          | 本段は「実行可否の判定」のみ。物理削除ジョブは作っていない                     |

## 複数resourceにまたがるロック順序

apply RPC は `undo_receipt_effects` を `(resource_type, COALESCE(plan_id, record_id))` の昇順で
処理する。順序を固定しないと、同一 user の複数 Undo が異なる順で行ロックを取りデッドロック
（40P01）を起こしうる（plan-critic / risk-reviewer 両方が独立に指摘）。今後、複数行 CAS を行う
RPC（trim 等）を実装する時も同じ正準順を踏襲すること。

## 検証

- `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries` green
- 新規 integration test 18 件 pass（`undo-receipt-rpc.integration.test.ts`）:
  happy path・冪等性（record/apply 両方）・CAS 正負・insert effect の DELETE undo・
  `effect_kind='delete'` の拒否・欠損検査・TTL 失効・権限交差 4 パターン（UI 由来常時許可・
  revoke・reauth 待ち・scope 不足・connection 物理削除）・他人の receipt への到達不可・
  field_name allowlist・function-level GRANT 不変条件
- `user-data-purge-enumeration.integration.test.ts` を更新: `undo_receipt_effects` が直接
  DELETE、`undo_receipt_field_changes` が CASCADE 到達、`undo_receipts` は直接 DELETE**しない**
  ことを固定（9 件 pass）
- `undo-substrate-schema.integration.test.ts`（第2段、テナント境界）は無変更で 23 件 pass
  （新規列・CHECK 追加による regression なし）
- 全 integration test（41 ファイル・444 件）green（新規回帰なし）
- ローカル SQL smoke test で権限交差・CAS・欠損検査・TTL・insert undo・revoke/reauth/scope の
  全パスを手動確認済み（psql、`private.*` 関数を直接呼び出し）

## 関連

- [step-1-technical-contract-freeze.md](./step-1-technical-contract-freeze.md) — T3 / T4 の凍結契約
- [step-2-expand-only-schema-foundation.md](./step-2-expand-only-schema-foundation.md) — schema 基盤・申し送り
- [overview.md](./overview.md) — 8 段依存順
- [#2443](https://github.com/Dayopt/dayopt/issues/2443) — T4 の訂正（CAS を mask 内に限定）
