---
description: 月次ガーデニング — sessions/を journal/へ蒸留し、ストックの鮮度を検証し、notes/の昇格漏れを回収する
---

# /gardening

月次で docs/ 全体の鮮度と一貫性を保守する。6ステップを順に実施し、最後に当月 journal へ記録して終わる。

## 手順

### 1. sessions/ → journal/ への蒸留

先月分の `docs/log/sessions/YYYY-MM-DD.md` を全て読み、`docs/log/journal/YYYY-MM.md`（先月分）に蒸留する。該当月ファイルが存在しなければ新規作成する。

蒸留の観点: できごと / 決定 / 学び / 数値（コミット数、変更規模など）。sessions/ の生ログをそのまま転記せず、意味のある単位にまとめる。

### 2. ストックの鮮度チェック（上位10件）

`docs:check` の対象ディレクトリ（product/ architecture/ guides/ operations/ business/ glossary/ projects/）配下の全 `.md` を `last_verified` の古い順に並べ、上位10件を triage する。各ファイルについて:

- 検証して問題なければ `last_verified` の日付だけ今日に更新する
- 内容が古ければ現状に合わせて修正し、`last_verified` を更新する
- 現状に対応する内容がなくなっていれば `status: deprecated` にする（削除はしない。deprecated のまま残す）

### 3. notes/ からストックへの昇格

先月分の `docs/log/notes/YYYY-MM-DD-*.md` を確認し、ストック（`architecture/` `business/` 等）へ反映すべき内容があれば反映する。反映した場合は「どの note のどの内容を、どのストックファイルへ反映したか」を journal（このコマンドのステップ6）に記録する。

feedback / incident の note は、対応がまだ `operations/` 側の手順に反映されていなければここで反映する。

### 4. projects/ の棚卸し

`docs/projects/` 配下を確認し、`status: done` または `status: paused` になっているのに `docs/log/archive/projects/` へ移されていないものを回収する。恒久的な学びをストック側へ反映してから `git mv` で `docs/log/archive/projects/` へ移す。`docs/projects/README.md` の索引も更新する。

### 5. スモークテスト（1問）

記憶に頼らず docs のみを根拠に、プロダクトの仕組みについての質問に1つ答えてみる（例:「entries の時間重なり制約はどう実装されているか」「なぜ繰り返し予定を採用しないのか」）。

- 答えられた場合: 特に記録不要
- 答えられなかった場合、または docs の記述が古くて答えと食い違った場合: その穴を `docs/log/notes/YYYY-MM-DD-gardening-gap-<topic>.md` に記録し、可能ならその場でストック側も修正する

### 6. journal への記録

このガーデニング実施の内容（蒸留したsessions件数、triageした上位10件の対応、昇格したnote、archiveしたproject、スモークテストの結果）を当月 `docs/log/journal/YYYY-MM.md` に追記して終了する。

## 守ること

- ステップ1の journal 追記は「先月分」の journal ファイルに対して行う（今月分ではない）。journal は書き終わったら追記専用（append-only）
- ステップ2のストック修正は通常の編集（append-only ではない）。ただしその修正内容自体は journal に残す
- このコマンドの最後に、当月分の journal ファイルが存在する状態になっていること（AGENTS.md の月次ガーデニング提案トリガーの解除条件）
