---
status: current
last_verified: 2026-08-10
code:
  - docs/projects/mcp-plan-track-learn/step-6-execution-checklist.md
  - apps/product/src/features/timeblock/server
  - supabase/migrations/20260729073123_mcp_stage1_legacy_writer_compatibility.sql
  - supabase/migrations/20260730090300_revoke_authenticated_timeblock_dml.sql
  - supabase/migrations/20260730090301_harden_authenticated_timeblock_write_boundary.sql
---

# Step 6 — Candidate 8 destructive cleanup の scope 確定

[Step 6 execution checklist](./step-6-execution-checklist.md) の Next sequence §1「Candidate 8 scope を現在の main から再定義する」の成果物。drop / revoke 対象を object signature 単位で固定し、前提条件と実行順序を定義する。実行状態は GitHub Issue [#1754](https://github.com/Dayopt/dayopt/issues/1754) の append-only comment を正とする。

調査時点は 2026-08-10（main 相当、migration 末尾 `20260809015344`）。repo 内 caller の有無は `rg` で全数確認済み。Production traffic の観測は未実施であり、本書の「zero-use」は repo レベルの事実に限る。

## 対象の全体像

候補 8 は 1 つの塊ではなく、drain 証拠が独立した 3 つの stage に分ける。

| Stage | 内容                                                                              | 可逆性                                             | 独立した zero-use 証拠                                            |
| ----- | --------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 8-1   | 旧 tRPC route / service method / compat test の app code 削除                     | `[minutes]`                                        | `api.plans.*` / `api.records.*` mutation の Production 呼び出し 0 |
| 8-2   | 旧 timeblock RPC の REVOKE → DROP（drain migration）                              | `[irreversible]`（forward restoration で復元可能） | 8-1 配信後の観測期間で旧 RPC 呼び出し 0                           |
| 8-3   | OAuth connection 契約の確定（legacy trigger drop + `connection_id SET NOT NULL`） | `[irreversible]`                                   | `connection_id IS NULL` の新規 insert 0 + 既存 NULL 行 0          |

分割の根拠は [workflow.md §PR 粒度](../../../.claude/rules/workflow.md#pr-粒度) の「code removal と destructive migration の混在回避」。8-1 は git revert で戻せる純粋な code 削除、8-2 / 8-3 は破壊的 migration で、承認境界を分ける。

## Stage 8-1 — app code 削除（可逆）

削除対象。いずれも app code（`apps/product/src/`）内の client caller 0 件を `rg` で確認済み（現行 UI は `planCommands` / `recordCommands`、MCP write は `mcp-mutation-client.ts` 経由の `apply_mcp_plan_*_v1` 系で、どちらも旧 route を経由しない）。ただし docs のコード例 2 ファイル（`docs/engineering/conventions.md` / `docs/engineering/architecture.md`）が `api.plans.*` mutation を例示しており、route 削除後は存在しない経路の例になるため、8-1 の追随作業として現行の `planCommands` / `recordCommands` の例へ書き換える。

- `plansRouter` の mutation procedure 群: `create` / `update` / `delete` / `restore` / `skip` / `unskip` / `record` / `confirmDay`（`apps/product/src/features/timeblock/server/plans-router.ts`）
- `recordsRouter` の mutation procedure 群: `create` / `update` / `delete` / `restore`（`records-router.ts`）
- `PlanService` / `RecordService` の対応 method（`plan-service.ts` / `record-service.ts`）。`list` / `getById` などの read 経路は現役のため残す
- compat test: `mcp-stage1-rollout-compat.integration.test.ts` / `mcp-stage1-writer-fence.integration.test.ts` のうち旧 RPC・旧 route を直接検証する部分、`plan-record-service.test.ts` の該当 assertion
- `rls-access.integration.test.ts` の旧 RPC 直呼び部分は、8-2 で関数が消えるまでは「まだ存在する境界」の検証として有効。8-1 では触らず 8-2 と同時に更新する

前提条件: Production の tRPC endpoint で `plans.*` / `records.*` mutation の呼び出しが観測期間中 0 件であること。観測手段は Vercel runtime logs（`/api/trpc/plans.delete` 等の path 単位）を第一候補とする。DB 側の `pg_stat_user_functions` は `track_functions` 設定に依存するため、使う場合は事前に設定値を確認する。

観測期間は「候補 6 merge（2026-08-03）以降の最終 production deploy から 14 日」を推奨する。drain 対象は旧 JS bundle を保持したままのブラウザで、**deploy は新規ロードにしか効かない** — 開きっぱなし・休止中のタブは旧 bundle を期限なく実行し続けられるため、観測期間 0 件でも残存確率は 0 にならない。この残存は許容する判断として記録する: 観測窓を超えて休止していたタブが 8-1 後に旧 mutation を呼ぶと操作は失敗するが、失敗は書き込み前に返り（データ破壊なし）、reload で新 bundle に復帰する。明示的な version rejection / 強制 reload 導線は closed beta 規模ではこの 1 ケースのために作らない（作るなら別 issue）。14 日はシンプルルール 5（2 週間）と揃えた値で、短縮・延長とこの残存許容の最終判断はユーザーが行う。

## Stage 8-2 — 旧 timeblock RPC の drain migration（不可逆）

`20260730090300_revoke_authenticated_timeblock_dml.sql` が「later drain migration で revoke する」と予告した migration 本体。対象は object signature 単位で以下に固定する。

DROP 対象（authenticated EXECUTE の REVOKE を同一 migration 内で先行させる）:

- `public.soft_delete_plan(uuid, uuid)` — SECURITY DEFINER wrapper（最新定義 `20260729073123`）
- `public.soft_delete_record(uuid, uuid)` — 同上
- `public.confirm_day_plans_to_records(uuid, timestamptz, timestamptz, timestamptz)` — 同上

存廃をユーザーが決める対象（checklist が「service-role recovery surface の存廃を運用手順とともに明示する」と要求している項目）:

- `public.restore_plan(uuid, uuid)` / `public.restore_record(uuid, uuid)` — service_role のみ EXECUTE 可。**推奨は DROP。** 現行の restore 経路は `planCommands.restore` / `recordCommands.restore` の command 実装が担っており、旧 RPC は冗長。復元手段は下記 forward restoration migration が担保する。残す場合は「いつ・誰が・どう使うか」の運用手順を docs に書く義務が発生し、zero-use のまま監査対象が増える

DROP しない対象（紛らわしいが現役）:

- `apply_mcp_plan_*_v1` / `apply_mcp_record_*_v1` 系 — 現行 MCP write の唯一の経路
- `create_plan_command_v1` / `update_plan_command_v1` 等の command_v1 系 — 現行 UI の経路
- `enforce_active_record_plan_v1()` — 経路非依存の整合性 trigger。コメントに cutover 期の記述が残るが機能は恒常
- `private.lock_timeblock_global_supported_write_v1()` — no-op 互換 shim。lifecycle command の呼び出し元リネームとセットでないと消せないため候補 8 の scope 外とし、別 issue に切り出す

前提条件:

- 8-1 が Production へ配信済みで、以後の観測期間（推奨 14 日）に旧 RPC の実行 0 件
- forward restoration migration（`20260729073123` の定義から 3 関数 + restore 2 関数を再作成する SQL）を先に用意し、ephemeral Preview で適用 rehearsal を通す。rollback ではなく forward restoration で戻すのが checklist の要求
- ephemeral Preview（data-less / non-persistent）で cleanup 適用 → 旧 RPC 呼び出しが関数不存在で拒否されることを確認。`SupabaseClient.rpc` 経由（既存アプリと同じ経路）では PostgREST の schema cache 状態により `PGRST202`（cache 未反映時は `42883`）が返るため、**両方を許容する**か `pg_proc` の catalog 照会で不存在を直接検証する（repo 内の先例: `rls-access.integration.test.ts` は存在しない `merge_tags` の検証を `PGRST202` で固定している）。現行経路（command / MCP write）が無傷であることも同時に確認

## Stage 8-3 — OAuth connection 契約の確定（不可逆）

調査で確定した事実: 「client gate 導入前の write connection を扱う互換コード」は存在しない。write connection は常に gate / connection binding を経由する設計で、互換レイヤが吸収しているのは **connection binding 以前の read-only 行**だけ。したがって候補 8 の「旧 connection」の実体は次の 3 点になる。

- `bind_legacy_oauth_insert_to_connection()` + trigger 2 本（`trigger_bind_legacy_oauth_code_connection` / `trigger_bind_legacy_oauth_token_connection`）の DROP — `connection_id IS NULL` の insert を吸収し続けている互換 trigger（write scope は例外送出で拒否済み）
- `oauth_authorization_codes` / `oauth_tokens` の `connection_id` に `SET NOT NULL` — `20260729062428` 系がコメントで予告した「old bundle drain 後の契約 migration」
- `oauth_connections.legacy_read_only` カラムは**残す**。過去行の分類として意味を持ち続け、refresh rotation の write 拒否ロジックが参照する

`20260723131150_disable_pre_client_gate_write_connections.sql`（#1760 内、main には未導入）の扱い: この migration は `write_enabled_at IS NOT NULL AND write_disabled_at IS NULL` の行へ `write_disabled_at` を刻む冪等 UPDATE。Production では write gate が一度も ON になっておらず `enabled_client_ids` も空のまま推移しているため、**対象行は 0 件の見込み**。preflight の read-only count で 0 件を確認できれば、適用は実質 no-op であり 8-3 に同梱してよい。1 件でも存在した場合は overview.md の取り決め通り、件数と顧客影響を確認した別の明示承認境界に切り出す。

前提条件:

- Production read-only preflight: `legacy_read_only = true` の行数、`connection_id IS NULL` の codes / tokens 行数を記録する。`disable_pre_client_gate_write_connections` の対象件数は **migration と同じ predicate**（`write_enabled_at IS NOT NULL AND write_disabled_at IS NULL`）で数える — `write_enabled_at IS NOT NULL` だけで数えると無効化済みの行まで対象候補に含め、実際の UPDATE 対象 0 件でも 8-3 を不要に停止させる。参考値として `write_enabled_at IS NOT NULL` の総数も併記してよいが、停止判定に使うのは前者
- `connection_id IS NULL` の既存行が残っている場合、`SET NOT NULL` の前に期限切れ削除（retention）での自然消滅を待つか、明示承認の上で終端させるかを決める

## 実行順序と承認境界

```
8-1 app code 削除 PR（draft → 内部反証レビュー → merge）
  → Production 配信 + 観測期間（推奨 14 日）
    → 8-2 drain migration PR（Preview rehearsal + forward restoration rehearsal 済み）
    → 8-3 契約 migration PR（preflight count 記録済み）
```

- 8-2 と 8-3 は前提が独立しているため、観測が揃った方から進めてよい。1 PR に束ねるかは前提の揃い方で決める（両方揃っていれば束ねるのが既定）
- 8-2 / 8-3 の PR merge・Production migration は `EXPLICIT AUTHORITY`。対象 object・環境・migration timestamp を指定した明示承認 + 独立レビュー（risk-reviewer / behavior-verifier）+ Preview rehearsal が揃うまで実行しない
- Stop condition は checklist の通り: 旧 surface の利用が 1 件でも観測されたら適用しない

## Conformance harness の再移植方針（checklist §3 の設計判断）

`step-6-conformance.md` が要求する「repo 内 1 command での再実行」は、#1760 の harness をそのままコピーしても成立しない。harness は v2 世代の分割 SDK（`@modelcontextprotocol/server` / `client` / `node` 各 2.0.0）に依存し、候補 7 で main に入った実装は `@modelcontextprotocol/sdk` v1 系（単一パッケージ）で書かれているため、`toNodeHandler` 等の import が解決できない。

- **Option α: v2 パッケージ 4 点を devDependencies として共存させる** — harness をほぼ無改変で持ち込めるが、本番 v1 / 検証 v2 の 2 世代混在になり、conformance が検証する契約と本番 handler の契約が一致する保証が崩れる
- **Option β（採用・実装済み）: harness を現行実装向けに書き直す** — 現行の `handleMcpProtocolRequest` は `(Request, HandleRequestOptions) => Promise<Response>`（`authInfo` 等を第 2 引数で受ける fetch 相当契約）なので、Node `http` サーバーで Request / Response を仲介し `options.authInfo` を合成する adapter を自前で書き、devDependency の追加は conformance CLI（`@modelcontextprotocol/conformance@0.1.16`、v1 SDK 系）1 点に絞った。stable 系 suite には旧 `server-stateless` scenario が存在しないため、active suite 全体を `--spec-version 2025-11-25`（SDK 1.30.0 の `LATEST_PROTOCOL_VERSION` と一致）で走らせ、expected-failures baseline は現行 suite に対して作り直した。詳細は [step-6-conformance.md](./step-6-conformance.md) §Current harness

harness は 8-x と独立した app-only 変更として先に main へ入れる（可逆・gate 無関係）。client beta 用 Preview を切る前に入れておくと、conformance evidence を candidate SHA に対して取れる。

## この設計が候補 8 に含めないもの

- Settings の connection 一覧 / revoke UI、client 停止時の恒久失効、maintenance dispatcher の due flag 完了判定 — checklist §3 の protocol verification 復帰作業。候補 8 と依存関係がなく、app-only で可逆なため並行して別 PR で進められる（settings feature には現在 `oauth_connections` への参照が 0 件であることを確認済み）
- 3 client 実機検証（Section B）と Production beta（Section D）— candidate 8 + protocol verification が main に揃った SHA から Preview を切るのが checklist §4 以降の前提
