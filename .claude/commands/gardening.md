---
description: 月次ガーデニング — セッションログを月次ロールアップへ蒸留し、ストックの鮮度を検証し、notes の昇格漏れを回収する
---

# /gardening

月次で docs/ 全体の鮮度と一貫性を保守する。6ステップを順に実施し、最後に当月ロールアップへ記録して終わる。

## 手順

### 1. セッションログ → 月次ロールアップへの蒸留

先月分の `docs/engineering/log/YYYY-MM-DD-session.md` を全て読み、`docs/engineering/log/YYYY-MM-01-journal.md`(先月分)に蒸留する。該当月ファイルが存在しなければ新規作成する。

蒸留の観点: できごと / 決定 / 学び / 数値(コミット数、変更規模など)。セッションログの生ログをそのまま転記せず、意味のある単位にまとめる。

### 2. ストックの鮮度チェック(上位10件)

`docs:check` の対象ディレクトリ(`business/` `product/` `marketing/` `engineering/` `operations/` `company/`)配下の全 `.md`(各ドメインの `log/` を除く)を `last_verified` の古い順に並べ、上位10件を triage する。各ファイルについて:

- 検証して問題なければ `last_verified` の日付だけ今日に更新する
- 内容が古ければ現状に合わせて修正し、`last_verified` を更新する
- 現状に対応する内容がなくなっていれば `status: superseded` にする(削除するかその場に残すかは内容の性質で判断。`docs/README.md` §フロントマター 参照)

### 3. notes からストックへの昇格

先月分の各ドメイン `docs/{domain}/log/YYYY-MM-DD-*.md`(decision / session / journal 以外の調査・監査ログ)を確認し、対応するドメインのストックへ反映すべき内容があれば反映する。反映した場合は「どの note のどの内容を、どのストックファイルへ反映したか」を月次ロールアップ(このコマンドのステップ6)に記録する。

feedback / incident の note は、対応がまだ `operations/` 側の手順に反映されていなければここで反映する。

### 4. スモークテスト(1問)

記憶に頼らず docs のみを根拠に、プロダクトの仕組みについての質問に1つ答えてみる(例:「entries の時間重なり制約はどう実装されているか」「なぜ繰り返し予定を採用しないのか」)。

- 答えられた場合: 特に記録不要
- 答えられなかった場合、または docs の記述が古くて答えと食い違った場合: その穴を `docs/engineering/log/YYYY-MM-DD-gardening-gap-<topic>.md` に記録し、可能ならその場でストック側も修正する

### 5. AI 設定棚卸しの提案（四半期）

`docs/engineering/log/` に `*-ai-config-audit.md` が直近 3 ヶ月存在しなければ、`audit-ai-config` skill による AI 設定棚卸しの実施をユーザーに提案する（このステップで実施はしない。提案のみ）。

### 5.5. 並行レーン sweep（月次）

`dispatch` skill（`.agents/skills/dispatch/SKILL.md`）の操作 C（sweep）を実施する。issue の外に溜まった作業（advisors / Dependabot alerts / 監査ログ残タスク / 生成スクリプトの故障 / 放置 PR）を検出し、見つけたら同 skill の intake で起票する。結果はステップ 6 のロールアップに件数を記録する。

### 6. 月次ロールアップへの記録

このガーデニング実施の内容(蒸留したセッション件数、triageした上位10件の対応、昇格したnote、スモークテストの結果)を当月 `docs/engineering/log/YYYY-MM-01-journal.md` に追記して終了する。

## 守ること

- ステップ1のロールアップ追記は「先月分」のファイルに対して行う(今月分ではない)。書き終わったら追記専用(append-only)
- ステップ2のストック修正は通常の編集(append-only ではない)。ただしその修正内容自体はロールアップに残す
- このコマンドの最後に、当月分のロールアップファイルが存在する状態になっていること(AGENTS.md の月次ガーデニング提案トリガーの解除条件)
- `archive/` ディレクトリは作らない(`docs/README.md` §フロントマター 参照)。役目を終えたストックは `status: superseded` を付けてその場に残すか、git に任せて削除する
