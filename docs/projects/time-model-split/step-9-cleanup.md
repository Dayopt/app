---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/entry
  - supabase/migrations
  - docs/product/specs/entry.md
---

# Step 9: 後始末（entries 系資産の削除と docs 反映）

cutover（Step 8）が安定した後、entries 系の DB 資産・旧コードを削除し、docs を新モデルへ更新して project を完了する。

## Goal

entries / `entries_effective` / 統計 RPC / 旧 UI コードをゼロ参照確認のうえ削除し、docs（specs / glossary / snapshot）を plans / logs の現実に揃える。

## Minimum Viable Approach

1. **ゼロ参照確認**（削除より先、機械的に）:
   - `rg "rpc\('get_" apps/product/src` — 統計 RPC 呼び出しゼロ
   - `rg "entries_effective|from\('entries'\)" apps/product/src` — entries 読みゼロ
   - entries router / `entriesRouter` の参照ゼロ（MCP の `entries-list` 合成互換を残す場合はそこだけ例外として明記）
2. drop migration: 統計 RPC 群 → `entries_effective` → entries 本体（trigger / index / RLS / EXCLUDE 込み）。**実施前に production バックアップの取得を確認**（Reversibility が [days] 級のため）
3. 旧コード削除: entry-service の entries 経路、`entry-time-model.ts`（`getEffectiveActualRange` — Step 2 で用途終了）、旧 `day-diff.ts` 実装、`actual-time-overlay.ts`、旧単一レーン描画、convert 系 procedure、`soft_delete_entry` 等の entries 用 RPC
4. `pnpm types:generate` で生成型から entries を消し、typecheck で残存参照を炙り出す
5. docs 反映:
   - `docs/product/specs/entry.md` を plan / log 仕様に改稿（または `plan-log.md` へ改名。specs は stock なので書き換え可）
   - `docs/product/glossary.md` — Plan / Log / 未記録 / 予定外の用語追加
   - `docs/engineering/data/db/rls-snapshot.md` 再生成
   - `docs/projects/time-model-split/summary.md` を追加（workflow.md: project 完了時）
   - ユーザー向け docs / リリースノートは `docs-writing` skill（`draft: true`）
6. **GitHub issue の棚卸し**: 旧モデル（entries / 自動記録 / superseded ADR）を前提にした open issue を検索し、新しい状態と関係ないものを閉じる
   - 検索軸: `entries` / `actual_start_time` / `entries_effective` / `auto-record`（自動記録） / 統計 RPC 名（`get_stats_page_data` 等） / ADR-011・018・019 への言及
   - 判定: (a) 前提が消滅した issue → ADR-025 と本 project へのリンクを添えて close（`not planned`） (b) 課題自体は生きているが記述が旧モデルの issue → plans / logs の用語で本文を書き直すか、コメントで読み替えを明記して残す。無言 close はしない
   - DB 系（entries の制約・index・RPC 改善）と docs 系（旧モデル前提のドキュメント修正）の issue が主な対象になるはず
7. `pnpm quality:deadcode` で削除漏れを検出

## Scope

やる: DB drop、コード削除、型再生成、docs 更新、issue 棚卸し、summary.md。
やらない: Phase 2（external 同期・ghost UI・calendar_connections）— 着手時に別途 step docs を切る。

## Reversibility Table

| Step                  | Tag       | 備考                                                                                         |
| --------------------- | --------- | -------------------------------------------------------------------------------------------- |
| 旧コード削除          | [minutes] | git revert で戻る                                                                            |
| RPC / view drop       | [hours]   | migration rollback で戻る（定義は migration 履歴にある）                                     |
| entries テーブル drop | [days]    | バックアップからの復元になる。cutover 後 1 週間の安定確認 + バックアップ確認を前提条件にする |

## Existing Code to Reuse

- Step 2 の検証クエリ — drop 前の最終突合に再利用
- `docs/engineering/data/db/rls-snapshot.md` の生成手順
- project skills: `docs-writing` / `supabase`

## What I'm Not Doing

- entries の「念のため」アーカイブテーブル化はしない。バックアップが担う責務で、アーカイブテーブルは第二の真実になる
- MCP `entries-list` 合成互換の削除はここでは判断しない（利用状況を見て別 decision）

## Follow-up

project 完了。Phase 2（external_calendar_events 同期・ghost・calendar_connections）は overview §5 を起点に、着手時に step-10 以降として詳細化する。
