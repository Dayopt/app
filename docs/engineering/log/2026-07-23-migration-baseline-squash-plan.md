---
status: frozen
date: 2026-07-23
code: supabase/migrations
---

# 次回 baseline squash は「全 active migration を version 据え置きで圧縮」とし、実施はリリース境界まで待つ

## 背景・当時の前提

`supabase/migrations/` の active migration が 142 件（`00000000000000_baseline.sql` + baseline 以降 141 件）まで増え、うち 51 件が `fix_` / `drop_` を名前に含む是正 migration だった（baseline 以降の約 36%）。`add_palette_items` → `drop_palette_items`、`create_user_badges` → `drop_user_badges` のように、短命なカラム・RPC の追加と削除が履歴に残り続けている。

前回の squash は 2026-03-17 に実施済みで、116 ファイルが `_archive/` に flat で保管され、運用実績が `_archive/README.md` に記録されている。

2026-07-23 時点の実測で、ローカルの 142 ファイルと production の `supabase_migrations.schema_migrations` 142 行が完全一致しており、履歴のドリフトはなかった（[#1523](https://github.com/Dayopt/dayopt/issues/1523)）。

## 決定と理由

計画のみ確定し、squash 自体は実施しない。計画は [`docs/projects/migration-baseline-squash/overview.md`](../../projects/migration-baseline-squash/overview.md) を正本とする（`status: paused`）。

確定した 3 点:

**1. 範囲は実施時点の active migration 全件**

部分 squash（古い一部だけ圧縮）は、残った migration との依存関係を人間が検証し続ける必要があり、履歴を読み解くコストが下がらない。全件圧縮なら「現在のスキーマ = baseline 1 ファイル」が成立する。

**2. 新 baseline の version は `00000000000000` に据え置き、中身だけ差し替える**

production の履歴には既に `00000000000000` が applied として存在する。version を据え置けばこの行をそのまま再利用でき、production 側の `migration repair` は「baseline 以降を reverted にする」片方向だけで済む。新 version を採番すると applied 行の追加と削除が両方必要になり、手順と失敗点が増える。前回方式の踏襲でもある。

**3. 実施タイミングは 3 条件が揃う最初のリリース境界**

migration を含む open PR がゼロ / 進行中の大規模スキーマ変更 project がない / リリース直後の静穏期。PR ごとの Supabase Preview branch は production の履歴を基に作られるため、開いている PR があると履歴不整合になる。

調査で判明した最重要の技術的制約:

- **前回 squash は写経漏れを 2 件出しており、うち 1 件は実障害になった。** `20260713121911_restore_baseline_table_grants.sql` の冒頭コメントが経緯を記録している。squash された baseline が default table grant を含まず、production は archive 済み履歴から grant を引き継いでいた一方、clean な local / Preview DB では RLS ポリシーが走る前にクライアントが失敗した。修復は squash の約 4 か月後（2026-07-13）。もう 1 件は storage bucket の `text/csv` 欠落で、未修復のまま
- production だけを見ていると気づけない種類の欠落である点が重要。`db diff --linked` は production と比較するため、production 側に grant が残っている限り差分に現れない
- `supabase migration squash` は**使わない**。pin 版 CLI 2.109.1 の `--version` は「出力先」ではなく「squash 範囲の終端」であり、`--version 00000000000000` は実質 no-op になる。さらに squash は圧縮対象ファイルを自分で削除して最新タイムスタンプのファイルへ書き込むため、version 据え置きの決定とも `_archive/` への `git mv` とも衝突する。前回同様 `supabase db dump --local` でスキーマを書き出す
- 出力に含まれないのはスキーマ定義以外（`INSERT` / `UPDATE` / `DELETE`）。公式リファレンスは欠落対象に cron ジョブ・storage バケット・vault シークレットを明記している
- production の実測では pg_cron job 0 件・vault secret 0 件・storage bucket 2 件。旧 baseline の cron 4 件は対象テーブル削除に伴い unschedule 済みで、**新 baseline に写経してはならない**
- storage bucket は `public` だけでは足りない。**avatars の 5MiB 制限と MIME allowlist を設定した migration は 142 件のどこにも存在せず**、production の値は migration から再現できない。squash はこれを版管理下へ戻す機会でもある

この「旧 baseline の記述と現在の実態がずれている」状態こそ squash で解消したい対象であり、同時に写経ミスが最も起きやすい箇所でもあるため、計画側で個別のリスク項目として扱う。

## 却下した選択肢と、なぜ捨てたか

### 今すぐ squash を実施する

R-08 の scope は計画策定までで、squash は production の migration 履歴書き換えを伴う `EXPLICIT AUTHORITY` 級の操作。実施ウィンドウ中は migration を含む PR の merge を止める必要もあり、スパイクの片手間に行う作業ではない。専用 issue と専用 PR に分ける。

### 新しい version を採番して baseline を作り直す

`00000000000000` を捨てて実施日のタイムスタンプで新 baseline を切る案。ファイル名から squash 時点が読み取れる利点はあるが、production 履歴で applied 行の追加と旧行の削除が両方必要になる。得られるのは可読性だけで、`_archive/README.md` と baseline ヘッダーに日付を書けば足りるため採用しない。

### `_archive/` を第 1 回 / 第 2 回のサブディレクトリに分ける

退避ファイルが 116 + 141 = 257 件になるため階層化する案。CLI はサブディレクトリを適用対象外にするので技術的には可能だが、`_archive/` は「復元も再適用もしない、調査目的でのみ読む」置き場であり、日付順の flat 一覧の方が grep しやすい。README にレンジを追記すれば区別できるため採用しない。

### squash をやめて migration を増やし続ける

`db reset` の所要時間と「現在のスキーマを読み解くコスト」が増え続ける。是正系が 36% を占める現状では、履歴を追う人間と AI の負担が実態を上回っている。前回 squash で運用実績もあるため継続する。

## 影響・やること

- 実施は本決定の範囲外。判定基準 3 条件を満たした時点で、計画書のチェックリストに沿って実施用 issue を起票する
- 実施は production の履歴書き換えを含むため、AGENTS.md の EXPLICIT AUTHORITY として**承認・独立レビュー（`risk-reviewer`）・backup・Preview / dry-run・roll-forward を揃える**。承認だけでは着手条件を満たさない
- 計画書に記載した production の実測値（cron 0 / vault 0 / storage bucket 2 の全カラム）は 2026-07-23 時点。**実施時に必ず取り直す**
- CLI の `db dump` / `migration repair` のフラグは、実施時点の pin 版（現在 `2.109.1`）で `--help` に再照合する
- 実施時は [#1462 migration failure recovery](https://github.com/Dayopt/dayopt/issues/1462) の復旧手順と矛盾しないか確認する
- 関連 issue: [#1523](https://github.com/Dayopt/dayopt/issues/1523)
