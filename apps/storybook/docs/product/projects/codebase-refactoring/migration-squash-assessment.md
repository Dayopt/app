# migration squash 判断資料（I-16 / Q3: 今回は見送り）

> **結論（2026-06-13）**: 今回は **見送り**。本資料は将来再検討するための手順・リスク・所要見積もり。

## 現状

- active migration: 115 件（`supabase/migrations/*.sql`、`00000000000000_baseline.sql` 起点）
- 前回 squash: 2026-03-17 に 117 migration を baseline へ圧縮（[`_archive/`](../../../../../supabase/migrations/_archive/README.md) に旧履歴を保管）
- baseline 以降に 114 migration が積み上がっている。`drop`/`remove` 系・`pre_drop`/`post_drop` の連鎖を含み、新規参加者・AI が「現在有効なスキーマ」を把握するコストが高い

## なぜ今回見送るか

- baseline は本番適用済み。再 squash は「新 baseline 生成 → 既存環境で `migration repair --status applied` → 新規環境は reset」という手順で、**操作ミス時の blast radius が production schema**。pre-launch の単一 project 運用では事故コストが見合わない
- 「現在有効な RLS / schema を読みやすくする」目的は、squash しなくても **自動生成 snapshot**（[`rls-snapshot.md`](../../../dev/db/rls-snapshot.md)）+ `pnpm types:generate` で達成できる。snapshot 整備（I-16）で当面の可読性ニーズは満たされる

## 将来 squash する場合の手順（参考）

1. ローカルで現行スキーマから新 baseline を生成（`supabase db dump` 系 / 旧 baseline と同方式）
2. 旧 active migration 114 件を `_archive/` へ git mv（履歴保持）
3. 新 baseline を `00000000000000_baseline.sql` に置換（または新タイムスタンプ baseline）
4. **既存 production**: `supabase migration repair --status applied <新baseline>` で適用済みマーク（DDL は実行しない）
5. **新規環境**: `supabase db reset` が新 baseline からスキーマ構築
6. `pnpm rls:snapshot` / `pnpm types:generate` で snapshot・型を再生成し差分ゼロを確認

## リスク

- `migration repair` の対象・順序を誤ると production の migration 履歴が壊れ、以降の migration 適用が詰まる（`[irreversible]` 寄り）
- squash 中に他の migration PR が merge されると baseline と衝突する（squash 専用の merge freeze が必要）
- preview branch（Supabase Branching）と baseline の整合確認が追加で必要

## 所要見積もり

- 設計 + 検証込みで 0.5〜1 日。merge freeze の調整コストを含むと実質はもう少し
- 推奨タイミング: **launch 後**、persistent staging branch を持てるようになってから（architecture.md「将来計画」と整合）

## 再検討トリガー

- active migration が 200 件を大きく超える
- 「現在有効な schema 把握」が snapshot だけでは追いつかなくなる
- staging branch 運用が整い、production と分離して squash を検証できるようになる
