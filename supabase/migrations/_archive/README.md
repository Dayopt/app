# `_archive/` — 歴史的 migration 記録（適用対象外）

このディレクトリには、`00000000000000_baseline.sql` へ squash される前の migration 116 件が
保管されている（日付レンジ: `00000000000000` 〜 `20260317000001`）。

## 位置づけ

- **適用されない**: Supabase CLI は `supabase/migrations/` 直下の `*.sql` のみを適用する。
  サブディレクトリの本ファイル群は migration 実行の対象外。
- **baseline に統合済み**: 2026-03-17 に 117 migration を `00000000000000_baseline.sql`
  へ圧縮した（baseline ファイル冒頭コメント参照）。本ディレクトリはその squash 前の履歴。
- **参照されない**: コード / CI / 他 migration からの参照はゼロ（grep 確認済み）。

## 運用ルール

- **復元・再適用しない**。現在有効なスキーマは `00000000000000_baseline.sql` 以降の
  active migration が定義する。過去の意図を辿る調査目的でのみ読む。
- 新規環境は `supabase db reset` が baseline からスキーマを構築する。既存環境は
  `supabase migration repair --status applied` で baseline 適用済みとしてマーク済み。
- 現在有効な RLS / テーブル構成を把握したい時は、全 migration を読まず
  [`docs/architecture/data/db/rls-snapshot.md`](../../../docs/architecture/data/db/rls-snapshot.md)
  （自動生成 snapshot）を参照する。
