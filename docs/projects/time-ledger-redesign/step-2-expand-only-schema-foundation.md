---
status: current
last_verified: 2026-08-27
code:
  - supabase/migrations/20260826234713_add_ledger_composite_tenant_anchors.sql
  - supabase/migrations/20260826234810_add_public_contract_exposure_guard.sql
  - supabase/migrations/20260826234911_add_ledger_undo_substrate.sql
  - supabase/migrations/20260826235012_repair_user_data_purge_enumeration.sql
  - scripts/ci/check-destructive-migration.mjs
  - scripts/generate-rls-snapshot.ts
  - apps/product/src/lib/test/integration/undo-substrate-schema.integration.test.ts
  - apps/product/src/lib/test/integration/user-data-purge-enumeration.integration.test.ts
  - docs/engineering/invariants.md
---

# time-ledger-redesign — Step 2: expand-only schema 基盤（[#2433](https://github.com/Dayopt/dayopt/issues/2433)）

[overview.md](./overview.md) §6 の 8 段依存順の **第2段**。後続段（Undo substrate / trim /
Proposal / canonical projection）が乗る DB 土台を **additive のみ**で敷いた成果物。

本書の役割は**棚卸しの記録** — 「第2段で敷いたもの」と「各段へ残したもの」の線引きを残し、
後続段が『これは自分の担当か』を毎回考え直さずに済むようにする。設計の理由そのものは各
migration のコメントが正本で、ここでは複製しない。

## 何を敷いたか

| 敷いたもの                                                                                      | 塞いだ攻撃シナリオ                                               | 正本                              |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| 複合 tenant FK の anchor（`plans` / `records` / `oauth_connections` へ `UNIQUE (id, user_id)`） | 2 の前提                                                         | `20260826234713`                  |
| Undo substrate 3 テーブル（構造のみ）                                                           | 1・2・3（構造半分）                                              | `20260826234911`                  |
| `public` 契約露出 guard（audit view + assertion + snapshot section）                            | 9・10（anon 側）                                                 | `20260826234810`                  |
| destructive checker の UPDATE backfill 検知                                                     | — （第8段の前提整備）                                            | `check-destructive-migration.mjs` |
| purge 列挙の修復と再発防止 test                                                                 | — （[#2444](https://github.com/Dayopt/dayopt/issues/2444) 同乗） | `20260826235012`                  |

攻撃シナリオの番号は [#2433 のコメント](https://github.com/Dayopt/dayopt/issues/2433#issuecomment-5432218386)（Codex B、全 10 件）が正本。

## 各段へ残したもの（本段で**やらなかった**こと）

境界を曖昧にすると後続段が「もう敷いてあるはず」と誤認するので、明示する。

| 残したもの                                                                        | 担当段                                                                                             | 本段での扱い                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Undo RPC 本体・TTL の具体値・権限交差の判定・TTL / revoke の transaction 内再検証 | 第3段（[#2434](https://github.com/Dayopt/dayopt/issues/2434)、シナリオ 4・5）                      | テーブルは敷いたが書き込み経路を作っていない                                     |
| `field_name` の allowlist CHECK                                                   | 第3段（シナリオ 6）                                                                                | 行が 0 件の今なら後から CHECK を足すのが完全に安全なため、RPC と同じ PR で入れる |
| `authenticated` への読み取り開放                                                  | 第3段                                                                                              | policy は確定させたが GRANT を出していない（下記）                               |
| Proposal のテーブル・列                                                           | [#2399](https://github.com/Dayopt/dayopt/issues/2399)（overview.md #15 が委譲済み、シナリオ 7・8） | 一切作っていない。状態機械の契約は凍結済みだが、形状を先に敷くと委譲と矛盾する   |
| canonical projection の view / RPC 本体                                           | 第7段                                                                                              | 命名・ACL 規約と guard だけを敷いた                                              |
| 旧 version RPC の `authenticated` EXECUTE                                         | 第7段（シナリオ 10 の残り半分）                                                                    | guard の対象外（下記）                                                           |
| `records.plan_id` の扱い                                                          | overview.md #10 の実装段                                                                           | 触っていない                                                                     |
| 不可逆 cleanup（DROP・列の意味変更・UPDATE backfill）                             | 第8段（[#2439](https://github.com/Dayopt/dayopt/issues/2439)、`EXPLICIT AUTHORITY`）               | expand-only の定義そのものとして除外                                             |

## 判断が要った 3 点

### 1. Undo effect に行単位の版列を持たせない

T4 は当初「field mask で戻す」と「対象行が変更されていたら all-or-nothing で失敗」を同時に
書いており両立していなかった。[#2443](https://github.com/Dayopt/dayopt/issues/2443) の訂正で
**(a) CAS の判定対象を mask 内のフィールドへ限定**が採られた。

本段はその帰結として `resource_version_before`（行の `updated_at` を控える列）を**置かない**。
CAS anchor は `undo_receipt_field_changes.after_value` が兼ねる。docs だけ直して schema に
版列を残すと、実装が行単位 CAS へ引き戻されて同じ矛盾が再発するため、schema 側でも閉じた。

### 2. `authenticated` へ GRANT を出さない

`supabase/config.toml` の `schemas` により `public` は PostgREST から自動公開される。SELECT を
与えた瞬間、行が 0 件でも列の形（`resource_type` の値域・`effect_kind` の enum・
`before_value` / `after_value` の JSONB 構造）が実運用中の read 契約として確定する。

現時点で読み手は 1 つも無い。開放は第3段で `GRANT` 1 行を足すだけ（additive）だが、一度
開けたものを閉じるのは契約の後退になる。`CLAUDE.md` ルール 4「不可逆だけ遅く、可逆は速く」の適用。

owner-scoped policy 自体は本段で確定させた（形を決める判断は先送りにしない）。policy はあるが
GRANT が無い状態は片落ちではなく、**GRANT と RLS が別々に判定される**ことを利用した二層防御。

### 3. guard の対象を `anon` に限る

`public` の SECURITY DEFINER 関数は 126 個あり、うち 6 個が `authenticated` へ EXECUTE を
与えている（実測）。これらは正当な RPC なので、`authenticated` の EXECUTE を一律に禁じると
現行機能が壊れる。guard は `anon` / `PUBLIC` 到達のみを機械で塞ぎ、旧 version RPC の
`authenticated` 権限（シナリオ 10 の残り半分）は「version ごとに exact signature で
REVOKE / GRANT を明示する」規約 + cutover 時のレビューで担保する。

## guard が現在 0 件であることについて

`private.public_contract_exposure_v1` は適用時点で違反 0 件を返す（`public` に view が 1 つも
無く、`anon` 実行可能な definer 関数も無い）。**これは今ある穴を塞ぐ修正ではなく、第7段が
持ち込む view / RPC に対する tripwire**であり、承知の上で先に置いた。

規約を守る対象より先に規約を置く理由は、第7段の実装が入ってから規約を書くと、その実装自体は
検査されないまま通ってしまうため。

## 検証

- 4 migration をローカル Supabase へ適用（`pnpm db:fresh`）。guard の assertion が通ること
- 新規 integration test 29 件 pass（tenant 越え 23 + purge 列挙 6）
- **両 guard を mutation test で反証**: RLS policy を `USING (true)` へ壊すと tenant test が
  落ち、purge 未登録の table を足すと列挙 test が落ちることを実測。戻すと両方 green
- destructive checker: 既存 262 migration 全件で既存パターンの検知結果が新旧**完全一致**
  （`UPDATE_BACKFILL` の追加が既存の検知を一切変えていない）
- `pnpm rls:snapshot:check` green（新 section 込み）

## 関連

- [step-1-technical-contract-freeze.md](./step-1-technical-contract-freeze.md) — T3 / T4 / T7 の凍結契約
- [overview.md](./overview.md) — 8 段依存順、#10 / #15 の裁定
- [#2443](https://github.com/Dayopt/dayopt/issues/2443) — T4 の訂正（本段の列設計の前提）
- [#2444](https://github.com/Dayopt/dayopt/issues/2444) — purge の列挙漏れ（本段へ同乗）
