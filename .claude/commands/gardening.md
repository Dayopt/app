---
description: 月次ガーデニング — セッションログを月次ロールアップへ蒸留し、ストックの鮮度を検証し、notes の昇格漏れを回収する
---

# /gardening

月次で docs/ 全体の鮮度と一貫性を保守する。10ステップを順に実施し、当月のjournalを1回だけ新規作成して終わる。`docs/engineering/log/YYYY-MM-01-journal.md` がすでに存在する場合は再編集せず、月次ガーデニング済みと報告する。追加監査が必要なら別の日付付きnoteを作る。

## 手順

### 1. セッションログ → 月次ロールアップへの蒸留

先月分の `docs/engineering/log/YYYY-MM-DD-session.md` を全て読み、今回新規作成する当月の`docs/engineering/log/YYYY-MM-01-journal.md`に蒸留する。

蒸留の観点: できごと / 決定 / 学び / 数値(コミット数、変更規模など)。セッションログの生ログをそのまま転記せず、意味のある単位にまとめる。

### 2. ストックの鮮度チェック(上位10件)

`docs:check` の対象ディレクトリ(`business/` `product/` `marketing/` `engineering/` `operations/` `company/`)配下の全 `.md`(各ドメインの `log/` を除く)を `last_verified` の古い順に並べ、上位10件を triage する。各ファイルについて:

- 検証して問題なければ `last_verified` の日付だけ今日に更新する
- 内容が古ければ現状に合わせて修正し、`last_verified` を更新する
- 現状に対応する内容がなくなっていれば `status: superseded` にする(削除するかその場に残すかは内容の性質で判断。`docs/README.md` §フロントマター 参照)

### 3. notes からストックへの昇格

先月分の各ドメイン `docs/{domain}/log/YYYY-MM-DD-*.md`(decision / session / journal 以外の調査・監査ログ)を確認し、対応するドメインのストックへ反映すべき内容があれば反映する。反映した場合は「どの note のどの内容を、どのストックファイルへ反映したか」を月次ロールアップ(このコマンドのステップ 10)に記録する。

feedback / incident の note は、対応がまだ `operations/` 側の手順に反映されていなければここで反映する。

### 4. スモークテスト(1問)

記憶に頼らず docs のみを根拠に、プロダクトの仕組みについての質問に1つ答えてみる(例:「entries の時間重なり制約はどう実装されているか」「なぜ繰り返し予定を採用しないのか」)。

- 答えられた場合: 特に記録不要
- 答えられなかった場合、または docs の記述が古くて答えと食い違った場合: その穴を `docs/engineering/log/YYYY-MM-DD-gardening-gap-<topic>.md` に記録し、可能ならその場でストック側も修正する

### 5. シンプルルールの検証（月次）

`AGENTS.md` §シンプルルール の 5 箇条が生きているか確認する。**守られているかではなく、使われているか**を見る。3 問に答える。

1. **今月このルールに戻った場面はあったか。** 1 度も戻らなかったルールは、判断の役に立っていないか発動条件が狭すぎる。どちらかを疑う
2. **無言で破られたルールはないか。** ルール 1 / 2 は override してよいが理由を一文残す約束になっている。理由なく通ったものがあれば、その判断を今から言語化する
3. **先月自分が触らなかった機能はどれか（ルール 5）。** 2 週間触っていない機能を挙げる。挙がったら削除候補として起票する（ステップ 7 の sweep がこの後に来るので、そちらへ回してよい）

所見が出たら `docs/product/log/YYYY-MM-DD-simple-rules-review.md` に記録する。所見なしなら記録不要（件数だけステップ 10 に書く）。

ルール自体を変える判断が出た場合はメタルール（6 個目を足すときはどれかを削る）に従い、`/decision` で決定ログを残す。

### 6. AI 設定棚卸しの提案（四半期）

`docs/engineering/log/` に `*-ai-config-audit.md` が直近 3 ヶ月存在しなければ、`audit-ai-config` skill による AI 設定棚卸しの実施をユーザーに提案する（このステップで実施はしない。提案のみ）。

### 7. 並行レーン sweep（月次）

`dispatch` skill（`.agents/skills/dispatch/SKILL.md`）の操作 C（sweep）を実施する。issue の外に溜まった作業（advisors / Dependabot alerts / 監査ログ残タスク / 生成スクリプトの故障 / 放置 PR）を検出し、見つけたら同 skill の intake で起票する。結果はステップ 10 のロールアップに件数を記録する。

### 8. 公開コンテンツ監査（月次）

`docs-audit` skill（`.agents/skills/docs-audit/SKILL.md`）を実行し、プロダクトの実機能と公開 docs（`apps/web/content/docs/`）のギャップ・鮮度乖離・en/ja 非対称を検出して Issue 化する。あわせて `area:blog` の Issue が枯渇していれば `blog-ideas` skill の実行をユーザーに提案する（提案のみ）。検出件数・起票件数はステップ 10 のロールアップに記録する。運用フローの正本は `docs/marketing/content-operations.md`。

コンテンツの数字も同時に記録する。Search Console と Vercel Analytics から、指名検索（"dayopt"）の表示・クリック、docs / blog の流入、上位クエリをステップ 10 の journal に書く（`docs/marketing/strategy.md` の指標と対応）。Search Console が未設定ならユーザーに設定を依頼する（`GOOGLE_SITE_VERIFICATION` env はコード対応済み）。

### 9. セキュリティ sweep（月次）

定期セキュリティ検査の cadence はここが正本（体制の全体像は `docs/operations/security.md` 第2部）。以下を順に実施する。

1. **Supabase security advisors** — `mcp__supabase__get_advisors`（type: `security`）で production の指摘を確認する（read-only）
2. **依存の脆弱性** — `pnpm security:check`（= `pnpm audit --audit-level=moderate`）を実行する
3. **深掘りスキャンの提案** — `/claude-security` の「Scan codebase」実行をユーザーに提案する。**このコマンドは `disable-model-invocation: true` のため AI 側からは起動できない**。提案のみ行い、実行はユーザーが自分で `/claude-security` を叩く。前回スキャンからの経過（`CLAUDE-SECURITY-*` ディレクトリの有無・日付）を添えて提案する。plugin 未インストールの環境（新しいマシン / 別プロファイル）では代わりに導入手順を案内する（`docs/operations/security.md` 第2部 §定期検査の cadence の前提）
4. **起票** — 1・2 で修正が必要な指摘を見つけたら、**このステップ内で** `dispatch` skill（`.agents/skills/dispatch/SKILL.md`）の intake を使って起票する。ステップ 7 はこの時点で終了しているため、そちらへ送らない
5. **記録** — 1〜4 で所見が出たら `docs/operations/log/YYYY-MM-DD-security-sweep.md` に記録する。所見なしなら記録不要（件数だけステップ 10 に書く）

実行件数・所見件数・起票件数はステップ 10 のロールアップに記録する。

### 10. 当月journalの作成

ステップ1の蒸留と、今回のガーデニング実施内容(蒸留したセッション件数、triageした上位10件の対応、昇格したnote、スモークテストの結果、シンプルルール検証の所見件数)をまとめ、当月`docs/engineering/log/YYYY-MM-01-journal.md`を新規作成して終了する。frontmatterは`status: frozen`と`date: YYYY-MM-01`を使う。

## 守ること

- journalを含むlogは初回commit後に追記・編集しない。当月journalが存在する場合は`YYYY-MM-DD-gardening-<topic>.md`を新規作成する
- ステップ2のストック修正は通常の編集(append-only ではない)。ただしその修正内容自体はロールアップに残す
- このコマンドの最後に、当月分のロールアップファイルが存在する状態になっていること(AGENTS.md の月次ガーデニング提案トリガーの解除条件)
- `archive/` ディレクトリは作らない(`docs/README.md` §フロントマター 参照)。役目を終えたストックは `status: superseded` を付けてその場に残すか、git に任せて削除する
