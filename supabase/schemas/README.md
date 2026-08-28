# `supabase/schemas/` — 手動キュレーションのスキーマ読み物（CLI 機能ではない）

このディレクトリの `*.sql` は **Supabase CLI の declarative schema 機能に結線されていない**。
`supabase db diff` / `db push` / `db reset` のいずれからも読まれず、DB へ適用されることもない。
人間と AI が現在のスキーマを短時間で把握するための、**手動で維持する読み物**である。

## なぜ結線しないか

`supabase/config.toml` の `[db.migrations] schema_paths = []` は空のまま**意図的に維持する**。

- ここにあるのは完全な DDL ではなく、要約・コメント付きの読み物。declarative schema として結線するには全ファイルを実行可能な DDL へ書き直す必要がある
- Dayopt の migration owner は Supabase GitHub integration であり、`local → PR Preview → production` の migration-first フローで運用する（[supabase skill](../../.claude/skills/supabase/SKILL.md)）。declarative schema は「schemas を編集して `db diff` で migration を生成する」逆向きのフローを前提とするため、現行運用と噛み合わない
- 判断の経緯: 2026-07-23 の decision ログ（削除済み、git 履歴参照）

## スキーマの正本はどこか

| 対象                             | 正本                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| **適用される定義（唯一の正本）** | `supabase/migrations/*.sql`                                                                  |
| 生成された型                     | `apps/product/src/lib/database/generated/database.types.ts`（`types:generate`）              |
| RLS の自動生成スナップショット   | [`docs/engineering/data/db/rls-snapshot.md`](../../docs/engineering/data/db/rls-snapshot.md) |
| **人間 / AI 向けの読み物**       | 本ディレクトリ                                                                               |

食い違いが見つかった場合、常に `migrations/` が正しい。本ディレクトリ側を直す。

## ファイル構成

| 番号  | ファイル               | 範囲                            |
| ----- | ---------------------- | ------------------------------- |
| `010` | `tables_core.sql`      | ドメインモデル中核テーブル      |
| `012` | `tables_ai.sql`        | AI 関連（すべて削除済みの記録） |
| `013` | `tables_security.sql`  | セキュリティ関連                |
| `014` | `tables_billing.sql`   | 課金・メール関連                |
| `016` | `tables_reports.sql`   | レポート                        |
| `017` | `tables_oauth.sql`     | OAuth 2.1 / MCP Remote Server   |
| `018` | `tables_analytics.sql` | プロダクト分析                  |
| `030` | `rls_policies.sql`     | RLS ポリシー一覧                |
| `040` | `functions.sql`        | 関数一覧                        |
| `060` | `cron_jobs.sql`        | pg_cron ジョブ一覧              |

番号は「テーブル → ポリシー → 関数 → ジョブ」の読む順序を示すだけで、実行順序ではない。
新カテゴリを足す時は既存の番号帯の間に入れ、欠番は詰めない。

## 同期ルール

migration を追加したら、**その migration が触れた領域のファイルだけ**を同じ PR で更新する。

1. 該当ファイルの本文を新しいスキーマに合わせる
2. 冒頭ヘッダーの `最終同期日` を今日の日付に更新する
3. `同期対象 migration` に今回の migration ファイル名を追加する

対象領域を変えない migration（データ backfill のみ、権限の微修正など）では更新不要。
同期漏れは lint では検出されない。レビュー時にヘッダーの日付と `migrations/` の最新を突き合わせる。

## baseline squash との関係

`同期対象 migration` に挙げたファイルは、将来の baseline squash で `migrations/_archive/` へ移動し得る。
その場合も**ヘッダーは書き換えない**。当時どの migration に合わせて同期したかの履歴として意味を持ち、
`_archive/` を読めば追跡できる。squash 計画は
[issue #1523 のコメント欄](https://github.com/Dayopt/dayopt/issues/1523)（旧 `docs/projects/migration-baseline-squash/overview.md`、docs/projects 全廃に伴い #2473 で移設）を参照。
