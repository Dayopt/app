---
name: gardening
user_invocable: true
description: ユーザーが月次ガーデニングの人間パート実施を明示依頼した時、または `/gardening` として明示起動された時に発動。Routine（自動パート）の draft PR とレポートを材料に、ルールの足し引き・superseded 判定・機能削除候補の確定など価値判断だけを行う。自動パートの実行契機は月初 Routine の scheduled trigger であり、この skill の invocation 契機ではない。
---

# /gardening

月次で docs/ 全体の鮮度と一貫性を保守する。2026-08-09 に発動アーキテクチャを反転した（経緯は 2026-08-09 の決定ログ、削除済み・git 履歴参照）:

- **自動パート** — 毎月 1 日 09:00 JST に Routine（Claude Code cloud の scheduled trigger）が fresh session で実施する。手順の正本は本ファイル §自動パート。Routine の prompt は「本ファイルの §自動パート に従う」とだけ指しており、手順の変更はこのファイルの編集だけで済む
- **人間パート** — Routine が作った draft PR とレポートを材料に、ユーザーと Main が価値判断だけを行う。本コマンド（`/gardening`）はこちらを指す

機械にできる検出・調査・下書きを人間の記憶に依存させない。人間が使うのは判断だけ、が設計原則（「機械で強制できるものは機械へ」の思想）。

**統治レビューへの重心移動（2026-08-10）。** 指揮台オーケストレーション運用（`dispatch` skill（旧 orchestration.md、#2479 で再編））が朝の編成で**速い変数**（open PR・issue の停滞、worktree・ブランチ残骸、milestone 実態）を日次で扱うようになった。gardening は**遅い変数**——権限境界（旧 orchestration.md §権限の既定、#2479 で廃止・git 履歴参照）・ルールの足し引き・機能の削除候補——を月 1 回、日次では溜まらない証拠（判断ジャーナルの分岐実績、月単位でしか動かない外部指標）に基づいて動かす場に絞る。二層構造は「日次が速い変数、gardening が遅い変数」で分担し、同じ検出項目を両方に持たせない。

## When to Use

**明示発動型** — この skill はユーザーの explicit な人間パート実施意図のみを契機に発動する（Routine の scheduled trigger による自動パート実行はこの skill の invocation 経路ではない）。

- 「ガーデニングやろう」「月次レビューして」など、月次ガーデニングの人間パート実施が明示依頼された時
- `/gardening` として明示的に起動された時
- Routine の draft PR が既に存在し、レビュー待ちリストの裁定を求められた時
- 当月 5 日を過ぎても journal の draft PR が無く、Routine の故障を疑って手動代行を提案・実施する時

## When NOT to Use

この skill は **explicit 人間パート実施意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 個別の意思決定ログ作成 → `decision` skill
- 公開 docs の監査そのもの（gardening の自動パート内から呼ばれる） → `docs-audit` skill

## 自動パート（Routine が実施）

fresh session で以下を順に実施し、成果物を「draft PR + issue + journal 内のレビュー待ちリスト」に着地させる。**価値判断（ルールの足し引き、superseded 判定、機能の削除候補の確定）は実行せず、必ずレビュー待ちリストに列挙して人間パートへ回す。** アプリコードは変更しない。

1. **journal 下書き** — 前月の merge commit 履歴（`git log --merges --since`）、closed issue / PR（feedback / incident / decision 相当のものを含む。2026-08-28、#2475 で domain log/ 廃止に伴い issue 起票へ一本化）から、当月分の journal を**下記 §成果物の着地 で作る draft PR の本文**として下書きする（独立ファイルは作らない。正本は git 履歴と merged PR という本ファイル共通の設計に合わせる）。観点: できごと / 決定 / 学び / 数値（マージ PR 数、変更規模、**Actions 経済メトリクス**: 当月の merge PR 数 / push 回数 / CI 課金分（概算で可）など。2026-09 の private 化以降、予算判断の基礎になる）、**repo surface 定点観測**（[epic #2165](https://github.com/Dayopt/dayopt/issues/2165) — #1536→#2067→#2165 と 3〜6 週おきに再発した棚卸しサイクルを、epic ではなく月次の 1 行 triage へ降格させるための観測。数え方の正本は issue #2166 のコメント欄で、ここでは複製しない）: root scripts 数 / workspace packages 数 / docs stock 数（`_archive/` 除く）/ test・story file 総数 の 4 指標を実測し、前月の journal 記録（PR 検索で辿る。初回は同 issue のコメント記載の baseline）と比較して journal に記す。**増加は機械的に fail 扱いにしない** — 増分の内訳（何が増えたか）を列挙するに留め、削除・統合候補の要否は人間パートの判断層検証（§人間パート 3）へ回す。**体感速度北極星**（`docs/operations/monitoring.md` §Scheduled review、#2294）: production LCP p95 / INP p95 と n（件数）を Sentry saved query で確認し journal に記す。取得できない環境（Sentry MCP 未接続等）なら「未取得」と明記する（§事業指標の既存パターンと同型）
2. **外部レビュー指摘の class 分類 → 機械化変換**（策定日: 2026-08-13、[#2018](https://github.com/Dayopt/dayopt/issues/2018)） — 当月 merge した PR の外部レビュー指摘（reviews / reviewThreads）を走査し、指摘を class（繰り返す構造の型。例: 壁時計/instant の TZ 再解釈、期限・予算の不等式マージン、docs と実装のドリフト）に分類する。**同一 class が当月 2 回以上、または過去月と通算 2 回以上**出ていたら、機械化（test / lint / CI 検査）の issue を起票する（起票時に機械化の形の仮説まで書く）。機械化済み class は翌月、再発ゼロを確認する（機械が効いている証拠）
3. **ストック鮮度 triage（上位 10 件）** — `docs:check` 対象ディレクトリ（`business/` `product/` `engineering/` `operations/` `company/`）配下の全 `.md` と、ドメイン外ルートへ昇格した `docs/strategy.md` を候補に含め、`last_verified` の古い順に並べて上位 10 件を検証する。問題なければ `last_verified` だけ更新、内容が古ければ修正して更新。**現状に対応する内容が無くなっている場合は `status: superseded` にせず、レビュー待ちリストへ**。**自動生成ファイル（`rls-snapshot.md` 等）は候補から除外する**（策定日: 2026-08-17、人間パート決定。自動生成物は人間の鮮度管理対象にせず、生成健全性は既存の生成系 script 確認がカバーする）
4. **issue 昇格候補の検出** — 前月に起票された feedback / incident 相当の issue（2026-08-28、#2475 で domain log/ 廃止に伴い issue 起票へ一本化）を確認し、ストックへ反映すべき内容を反映する。`operations/` 側の手順に未反映の incident 対応も同様
5. **スモークテスト（1 問）** — 記憶に頼らず docs のみを根拠にプロダクトの仕組みへの質問に 1 つ答える。答えられなければ穴を issue として起票し、可能ならストック側も直す
6. **並行レーン sweep** — `dispatch` skill（`.claude/skills/dispatch/SKILL.md`）の操作 C の**月次 backstop 項目のみ**実施する（日次項目は指揮台の朝編成が吸収済み。`dispatch` skill 操作 C §日次）。発見は同 skill の intake で起票する
7. **公開コンテンツ監査** — `docs-audit` skill を実行し、実機能と公開 docs のギャップ・鮮度乖離・en/ja 非対称を検出して起票する。`area:blog` issue が枯渇していればレビュー待ちリストに記す。コンテンツの数字（Search Console / Vercel Analytics の指名検索・流入・上位クエリ）と事業指標（`docs/business/business-model.md` §Metrics の定義に従う WAU・課金率・チャーン。Stripe / Supabase から read-only で取得）は、取得できる環境なら journal に記録し、できなければ「未取得」と明記する。事業の現在地はこの月次記録を正とし、常設の進捗文書は作らない
8. **セキュリティ sweep** — advisors 確認は **cloud Supabase MCP（`--read-only`、オンデマンド登録）を標準経路とする**（策定日: 2026-08-17、人間パート決定）: `mcp-usage` skill §`supabase`(cloud) はオンデマンド登録する の手順で登録 → `get_advisors`（type: security）を実行 → 使用後に登録解除する。ローカル DB（`supabase-local`）は使わない（worktree 間で共有状態を持ち、他 branch の migration を抱えて advisors 結果が汚染されうるため）。あわせて `pnpm security:check` を実施。修正が必要な指摘は dispatch intake で起票。所見があれば journal（draft PR 本文）に記録する
9. **四半期チェック** — 直近 3 ヶ月に AI 設定棚卸し（`audit-ai-config` skill）実施の issue / merged PR が無ければ（`gh search issues --repo Dayopt/dayopt "audit-ai-config" --include-prs` 等で検索）、レビュー待ちリストに「AI 設定棚卸しの実施提案」を記す。**skill / rules ファイルの鮮度を git log で判定する時は `audit-ai-config` skill §Review Questions 1 の shallow-clone 注意（`.git/shallow` 境界が 2026-07-15 に付き `git log -1` が汚染される）に従う**
10. **成果物の着地** — branch `claude/gardening-YYYY-MM` を作り、鮮度更新（あれば）を commit して **draft PR** を作成する。journal（できごと / 決定 / 学び / 数値 / レビュー待ちリスト）は commit せず **PR 本文**に書く（正本は git 履歴と merged PR であり、独立ファイルは持たない）。issue は各ステップ内で起票済みであること。PR 本文に「実施したステップ / 起票した issue / レビュー待ちリストの件数」も要約する

### 2026-09 限定 agenda

策定日: 2026-08-17（人間パート決定、PR #2110 コメント参照）。2026-09 の gardening（自動パート・人間パートいずれか適切な方）でのみ実施し、完了後は本節を削除する。

- **Actions 8 月実測 vs 外挿 6,820 分の突き合わせ + PR 束ね反転効果の検証** — Actions 経済の規律（旧 AGENTS.md 記述、#2479 で圧縮・git 履歴参照）の private 化保留判断の前提になった外挿値と、2026-08 の実測（journal のマージ PR 数 / push 回数 / CI 課金分）を突き合わせる。あわせて `AGENTS.md §PR / git 運用` の束ね運用が実際に CI run 数を下げているかを検証する
- **skill / plugin 発火実績確認**（[#2067](https://github.com/Dayopt/dayopt/issues/2067) 移管分） — 上記「四半期チェック」項目とは別に、#2067 の close コメントで 2026-09 gardening へ移管された発火実績確認を実施する

## 人間パート（/gardening で実施）

Routine の draft PR が存在する前提で、ユーザーと Main が以下を行う。所要 30 分以内を目安とする。

1. **draft PR のレビューと merge** — journal 下書きと鮮度更新を確認し、`pnpm branch:finish` で merge する
2. **レビュー待ちリストの裁定** — superseded 判定、昇格の採否、AI 設定棚卸しの実施可否を決める
3. **判断層の検証**（`AGENTS.md` §シンプルルール） — ①今月このルールに戻った場面はあったか（1 度も戻らないルールは削る候補）②無言で破られたルールは無いか（あれば今から理由を言語化）③先月触らなかった機能はどれか（ルール 5。削除候補は dispatch intake で起票）④**決定ログの sweep**（2026-08-28、#2475 でラベル→月次 sync 機構は廃止。分岐時点で `docs/decisions.md` へ直接 1 行追記する運用へ移行済み。`dispatch` skill 冒頭「履歴もコメントに落とす」参照） — `gh search issues --repo Dayopt/dayopt --label judgment:diverged --include-prs` で、判定材料が揃っているのに追記が漏れている分岐が無いか確認し、見つかれば追記する。判定済み事例（`docs/decisions.md` に記録済みの全件）を母集団に権限境界（旧 orchestration.md §権限の既定、#2479 で廃止・git 履歴参照）を実測で更新する（可逆な采配を指揮台決定 + opt-out にする試行運用の恒久化 / 巻き戻しの判定もここで行う）
4. **実行層の検証**（pause point 運用） — ⑤各チェックは今月何かを捕まえたか ⑥pause point の迂回の痕跡は無いか ⑦機械へ昇格できる項目は無いか
5. **深掘りスキャン** — claude-security プラグイン（multi-agent のリポジトリ全体走査 + 敵対検証 + patch 生成）を月次の 1 項目として月 1 回転する。per-PR には重すぎる（1 回で数百万 token 級）ため per-PR 層（plan-review / レーン反証 / 指揮台クロスレビュー）には組み込まず、変更同士の合成で開く穴（per-PR レビューの構造的死角）を拾う backstop と位置づける。専用セッションで、**User の明示同意の下で起動**する（プラグインは大量 token 消費の明示 opt-in が前提の設計。`/claude-security` の「Scan codebase」はユーザーのみ起動できる、`disable-model-invocation: true`）。走行レーンが 1 本も無い日に行う（同日に通常レーンを並走させない — findings が in-flight 変更と衝突して triage が濁る）。findings は全件 issue 化して通常の編成へ流す。patch の適用は findings の triage 後に個別判断する。初回実施は 2026-09 の gardening
6. 3・4 で所見が出たら journal（draft PR 本文）に記録する。項目や pause point を変える場合はメタルール（**1 つ足すときは 1 つ削る**）に従い `/decision` で決定ログを残す

## 故障モード

- **当月 5 日を過ぎても journal の draft PR が無い** — Routine の故障を疑う。`list_triggers` で状態を確認し、必要なら手動で自動パートを実施する（CLAUDE.md §Docs 運用責務 の提案トリガー）
- **Routine が起票だけして PR を作れなかった** — 部分成果として扱い、人間パートで不足分を補う。黙って全部やり直さない（重複起票を防ぐ）

## 守ること

- journal は独立ファイルを持たない（PR 本文）。同月に追加で記録したい所見が出たら、既存 PR が open なら本文へ追記し、既に merge 済みなら次の gardening 回の journal へ回す
- 鮮度 triage のストック修正は通常の編集（append-only ではない）。ただし修正内容自体は journal（PR 本文）に残す
- `archive/` ディレクトリは作らない（`docs/README.md` §フロントマター 参照）。役目を終えたストックは `status: superseded` を付けてその場に残すか、git に任せて削除する
- Routine の出力は必ず issue・draft PR・レビュー待ちリストのいずれかに着地させる。「実施したがどこにも残っていない」を作らない（読まれない在庫の防止）
