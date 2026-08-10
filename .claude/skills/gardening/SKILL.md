---
name: gardening
description: ユーザーが月次ガーデニングの人間パート実施を明示依頼した時、または `/gardening` として明示起動された時に発動。Routine（自動パート）の draft PR とレポートを材料に、ルールの足し引き・superseded 判定・機能削除候補の確定など価値判断だけを行う。自動パートの実行契機は月初 Routine の scheduled trigger であり、この skill の invocation 契機ではない。
---

# /gardening

月次で docs/ 全体の鮮度と一貫性を保守する。2026-08-09 に発動アーキテクチャを反転した（経緯は [2026-08-09-gardening-routine-split.md](../../../docs/engineering/log/2026-08-09-gardening-routine-split.md)）:

- **自動パート** — 毎月 1 日 09:00 JST に Routine（Claude Code cloud の scheduled trigger）が fresh session で実施する。手順の正本は本ファイル §自動パート。Routine の prompt は「本ファイルの §自動パート に従う」とだけ指しており、手順の変更はこのファイルの編集だけで済む
- **人間パート** — Routine が作った draft PR とレポートを材料に、ユーザーと Main が価値判断だけを行う。本コマンド（`/gardening`）はこちらを指す

機械にできる検出・調査・下書きを人間の記憶に依存させない。人間が使うのは判断だけ、が設計原則（`.claude/rules/workflow.md` §Pause point の「機械で強制できるものは機械へ」と同じ思想）。

**統治レビューへの重心移動（2026-08-10）。** 指揮台オーケストレーション運用（`.claude/rules/orchestration.md`）が朝の編成で盤面（open PR・issue の停滞、worktree・ブランチ残骸、milestone 実態）という**速い変数**を日次で扱うようになった。gardening は**遅い変数**——権限境界（`orchestration.md` §権限の既定）・ルールの足し引き・機能の削除候補——を月 1 回、日次では溜まらない証拠（判断ジャーナルの分岐実績、月単位でしか動かない外部指標）に基づいて動かす場に絞る。二層構造は「日次が速い変数、gardening が遅い変数」で分担し、同じ検出項目を両方に持たせない。

## When to Use

**明示発動型** — この skill はユーザーの explicit な人間パート実施意図のみを契機に発動する（Routine の scheduled trigger による自動パート実行はこの skill の invocation 経路ではない）。

- 「ガーデニングやろう」「月次レビューして」など、月次ガーデニングの人間パート実施が明示依頼された時
- `/gardening` として明示的に起動された時
- Routine の draft PR が既に存在し、レビュー待ちリストの裁定を求められた時
- 当月 5 日を過ぎても journal の draft PR が無く、Routine の故障を疑って手動代行を提案・実施する時

## When NOT to Use

この skill は **explicit 人間パート実施意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 個別の意思決定ログ作成 → `decision` skill
- 個別の調査・監査ログ作成 → `note` skill
- 公開 docs の監査そのもの（gardening の自動パート内から呼ばれる） → `docs-audit` skill

## 自動パート（Routine が実施）

fresh session で以下を順に実施し、成果物を「draft PR + issue + journal 内のレビュー待ちリスト」に着地させる。**価値判断（ルールの足し引き、superseded 判定、機能の削除候補の確定）は実行せず、必ずレビュー待ちリストに列挙して人間パートへ回す。** アプリコードは変更しない。

1. **journal 下書き** — 前月の merge commit 履歴（`git log --merges --since`）、closed issue / PR、各ドメイン `log/` の decision・note・feedback・incident ログから、当月 `docs/engineering/log/YYYY-MM-01-journal.md` を下書きする。観点: できごと / 決定 / 学び / 数値（マージ PR 数、変更規模など）。frontmatter は `status: frozen` + `date: YYYY-MM-01`
2. **ストック鮮度 triage（上位 10 件）** — `docs:check` 対象ディレクトリ（`business/` `product/` `engineering/` `operations/` `company/`）配下の全 `.md`（各 `log/` を除く）を `last_verified` の古い順に並べ、上位 10 件を検証する。問題なければ `last_verified` だけ更新、内容が古ければ修正して更新。**現状に対応する内容が無くなっている場合は `status: superseded` にせず、レビュー待ちリストへ**
3. **notes 昇格候補の検出** — 前月の各ドメイン `log/`（decision / journal 以外の調査・監査ログ）を確認し、ストックへ反映すべき内容を反映する。feedback / incident の note で `operations/` 側の手順に未反映のものも同様
4. **スモークテスト（1 問）** — 記憶に頼らず docs のみを根拠にプロダクトの仕組みへの質問に 1 つ答える。答えられなければ穴を `docs/engineering/log/YYYY-MM-DD-gardening-gap-<topic>.md` に記録し、可能ならストック側も直す
5. **並行レーン sweep** — `dispatch` skill（`.claude/skills/dispatch/SKILL.md`）の操作 C の**月次 backstop 項目のみ**実施する（日次項目は指揮台の朝編成が吸収済み。`orchestration.md` §1 日サイクル）。発見は同 skill の intake で起票する
6. **公開コンテンツ監査** — `docs-audit` skill を実行し、実機能と公開 docs のギャップ・鮮度乖離・en/ja 非対称を検出して起票する。`area:blog` issue が枯渇していればレビュー待ちリストに記す。コンテンツの数字（Search Console / Vercel Analytics の指名検索・流入・上位クエリ）と事業指標（`docs/business/business-model.md` §Metrics の定義に従う WAU・課金率・チャーン。Stripe / Supabase から read-only で取得）は、取得できる環境なら journal に記録し、できなければ「未取得」と明記する。事業の現在地はこの月次記録を正とし、常設の進捗文書は作らない
7. **セキュリティ sweep** — `mcp__supabase__get_advisors`（type: security、read-only）と `pnpm security:check` を実施。修正が必要な指摘は dispatch intake で起票。所見があれば `docs/operations/log/YYYY-MM-DD-security-sweep.md` に記録
8. **四半期チェック** — `docs/engineering/log/` に `*-ai-config-audit.md` が直近 3 ヶ月無ければ、レビュー待ちリストに「AI 設定棚卸し（`audit-ai-config` skill）の実施提案」を記す
9. **成果物の着地** — branch `claude/gardening-YYYY-MM` を作り、journal（レビュー待ちリスト含む）と鮮度更新を commit して **draft PR** を作成する。issue は各ステップ内で起票済みであること。PR 本文に「実施したステップ / 起票した issue / レビュー待ちリストの件数」を要約する

## 人間パート（/gardening で実施）

Routine の draft PR が存在する前提で、ユーザーと Main が以下を行う。所要 30 分以内を目安とする。

1. **draft PR のレビューと merge** — journal 下書きと鮮度更新を確認し、`pnpm branch:finish` で merge する
2. **レビュー待ちリストの裁定** — superseded 判定、昇格の採否、AI 設定棚卸しの実施可否を決める
3. **判断層の検証**（`CLAUDE.md` §シンプルルール） — ①今月このルールに戻った場面はあったか（1 度も戻らないルールは削る候補）②無言で破られたルールは無いか（あれば今から理由を言語化）③先月触らなかった機能はどれか（ルール 5。削除候補は dispatch intake で起票）④**判断ジャーナル集計** — `gh search issues --repo Dayopt/dayopt --label judgment:diverged --include-prs --limit 200` で現在ラベルが付く全分岐（issue / PR）を取得し、結果を観測できた事例に判定コメントを追記してラベルを外す。判定済み事例だけを母集団に `.claude/rules/orchestration.md` §権限の既定 の境界を実測で更新する（可逆な采配を Fable 決定 + opt-out にする試行運用の恒久化 / 巻き戻しの判定もここで行う）
4. **実行層の検証**（`.claude/rules/workflow.md` §Pause point） — ⑤各チェックは今月何かを捕まえたか ⑥pause point の迂回の痕跡は無いか ⑦機械へ昇格できる項目は無いか
5. **深掘りスキャン** — `/claude-security` の「Scan codebase」はユーザーのみ起動できる（`disable-model-invocation: true`）。前回スキャンからの経過を添えて実施を判断する
6. 3・4 で所見が出たら `docs/product/log/YYYY-MM-DD-simple-rules-review.md` に記録する。項目や pause point を変える場合はメタルール（**1 つ足すときは 1 つ削る**）に従い `/decision` で決定ログを残す

## 故障モード

- **当月 5 日を過ぎても journal の draft PR が無い** — Routine の故障を疑う。`list_triggers` で状態を確認し、必要なら手動で自動パートを実施する（CLAUDE.md §Docs 運用責務 の提案トリガー）
- **Routine が起票だけして PR を作れなかった** — 部分成果として扱い、人間パートで不足分を補う。黙って全部やり直さない（重複起票を防ぐ）

## 守ること

- journal を含む log は初回 commit 後に追記・編集しない。当月 journal が存在する場合は `YYYY-MM-DD-gardening-<topic>.md` を新規作成する
- 鮮度 triage のストック修正は通常の編集（append-only ではない）。ただし修正内容自体は journal に残す
- `archive/` ディレクトリは作らない（`docs/README.md` §フロントマター 参照）。役目を終えたストックは `status: superseded` を付けてその場に残すか、git に任せて削除する
- Routine の出力は必ず issue・draft PR・レビュー待ちリストのいずれかに着地させる。「実施したがどこにも残っていない」を作らない（読まれない在庫の防止）
