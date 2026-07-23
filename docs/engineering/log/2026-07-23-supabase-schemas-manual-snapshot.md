---
status: frozen
date: 2026-07-23
code: supabase/schemas
---

# `supabase/schemas/` は declarative schema に結線せず、手動の読み物として明文化する

## 背景・当時の前提

`supabase/config.toml` の `[db.migrations] schema_paths` が空配列のまま、`supabase/schemas/*.sql` が 9 ファイル存在していた。Supabase CLI の declarative schema 機能に結線されていないため、これらは `db diff` / `db push` / `db reset` のいずれからも読まれない。

一方で各ファイル冒頭には「読み物用 — CLIでは使用しない」「最終同期日 / 同期対象 migration」というヘッダーがあり、直近も 2026-07-13 / 2026-07-16 に手動同期されていた。つまり手動運用は実際に機能していたが、`schemas/` というディレクトリ名と CLI の同名機能が紛らわしく、「結線し忘れ」に見える状態だった（[#1522](https://github.com/Dayopt/dayopt/issues/1522)）。

Dayopt の migration owner は Supabase GitHub integration で、`local → PR Preview → production` の migration-first フローで運用している。

## 決定と理由

結線しない。`schema_paths = []` を意図的な設定として維持し、位置づけを文書化する。

- ファイルの中身が完全な DDL ではなく、要約とコメントによる読み物。結線するには全ファイルを実行可能な DDL へ書き直す必要があり、スパイクの範囲を超える
- declarative schema は「`schemas/` を編集して `db diff` で migration を生成する」フローを前提とする。Dayopt の migration-first フロー（migration を書き、Preview branch で検証し、merge で production へ適用）とは向きが逆で、両立させると正本が二重になる
- 読み物としての価値は実際に使われている。RLS は自動生成の `docs/engineering/data/db/rls-snapshot.md` が担うが、テーブル・関数・cron の全体像を短時間で掴む用途は代替がない
- 問題は運用そのものではなく「明文化されていないこと」だった。そこだけ直せば十分

具体的な成果物:

- `supabase/schemas/README.md` — CLI 機能ではないこと、正本は `migrations/` であること、同期ルール、ファイル番号の区分、squash 後もヘッダーを書き換えない方針
- `supabase/config.toml` — `schema_paths = []` の直前に、意図的に空であることと README への参照をコメントで追加

## 却下した選択肢と、なぜ捨てたか

### declarative schema へ結線する

`schema_paths = ["./schemas/*.sql"]` を設定し、`db diff` で migration を生成する運用へ移行する案。全ファイルの DDL 化に加え、migration owner が GitHub integration である現行の Branching 運用と衝突する。結線した瞬間に「schemas を編集して diff を取る」流れが正になり、PR Preview による migration 検証の位置づけが曖昧になるため採用しない。

### `schemas/` を削除する

CLI 機能でないなら消してしまう案。RLS 以外の全体像（テーブル・関数・cron）を掴む手段が失われる。9 ファイルの維持コストは migration を書く時の追記のみで小さく、削除の便益が薄いため採用しない。

### ディレクトリ名を `schemas/` から改名する

CLI の同名機能との混同を名前で解消する案。混同は README とコメント 2 行で解消でき、改名は既存の参照（ドキュメント、過去の PR、AI の学習済み経路）を壊す。可逆性は高いが便益が名前の見た目だけのため採用しない。

## 影響・やること

- migration を追加した PR では、対象領域の `schemas/*.sql` とヘッダー（最終同期日 / 同期対象 migration）を同じ PR で更新する。同期漏れは lint では検出されないため、レビュー時に突き合わせる
- `schemas/*.sql` の本文が現在のスキーマとずれていないかの棚卸しは、本決定の範囲外（別作業）
- baseline squash で `同期対象 migration` が `_archive/` へ移っても、ヘッダーは書き換えない。計画は [`docs/projects/migration-baseline-squash/overview.md`](../../projects/migration-baseline-squash/overview.md)
- 関連 issue: [#1522](https://github.com/Dayopt/dayopt/issues/1522)
