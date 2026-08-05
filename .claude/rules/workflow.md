# ワークフロー規約

策定日: 2026-04-23

Dayopt の作業を進める際の規約。作業規模に応じて進め方を使い分ける。

## 作業規模の判定

以下のいずれか 1 つでも該当 → **大規模**（保守的判定）:

- 想定コミット数 6 以上
- 想定 Step 数 5 以上
- 想定作業時間 1 日以上
- blast radius が shell / layout / routing 横断
- 未知の発見リスクが高い（設計途中で方針変更ありうる）
- 新 feature の新設

いずれかに該当 → **中規模**:

- 想定コミット数 3-5
- 想定 Step 数 2-4
- 想定作業時間 半日程度
- 1 feature 内に閉じる

上記以外 → **小規模**:

- 想定コミット数 1-2
- 想定 Step 数 1
- 想定作業時間 1 時間以下
- 1 ファイル / 1 module に閉じる

## 規模別の進め方

### 大規模

- Project 全体設計書を必ず作成（`docs/projects/{project-name}/overview.md`）
- 複雑な Step は Step 詳細設計書（`step-X-detail.md`）
- 各 Step で事前調査プロンプト必須
- 相談事項は Option α/β/γ 形式で提示
- path-limited add / git diff --cached を必須ゲートに

### 中規模

- Project 全体設計書は推奨（省略する場合は理由を明示）
- Step 詳細設計書は省略可
- 事前調査プロンプトは推奨
- 相談事項は Option 形式
- path-limited add は採用

### 小規模

- 設計書作成不要
- 事前調査プロンプト省略可
- 直接実装プロンプトで OK
- blast radius を事前確認のみ

### 迷った時

規模を大きめに判定して手法をフル採用。overhead より手戻り回避を優先。

### 規模と PR の関係

**Step 分割は「作業と plan の単位」であって「merge の単位」ではない。** 大規模 project を 6 Step に割っても、PR は機能のまとまりで束ねる（§PR 粒度）。Step ごとに PR を切らない。

## Project 命名規則

形式: `{domain}-{action}[-{variant}]`

原則:

- **domain**: 主要な影響範囲（sidebar / tag / auth / calendar / stats / ai 等）
- **action**: 動詞ベース（redesign / migration / refactor / unification / cleanup 等）
- **variant**: 必要なら区別（design / implementation / cleanup 等）
- kebab-case で統一
- Phase N-X のような記号的命名は使わない
- 連続 project は domain 接頭辞で関係性を表現

### 実例

**良い例**:

- `sidebar-routing-unification`（旧 Phase 2-B）
- `sidebar-3-mode-structure`（旧 Phase 2-C）
- `sidebar-v2-design`（旧 Phase 2-D）
- `feature-colocation-migration`（旧 Phase 2-E）
- `tag-management-refactor`
- `calendar-state-unification`

**悪い例**:

- `phase-2-c`（記号的、内容不明）
- `sidebar-work`（action が曖昧）
- `fix-stuff`（domain 不明）

## 設計書の保存場所

散文の設計書は repo 直下 `docs/projects/` に置く（Storybook には載せない。ビルド不要で GitHub 上でそのまま読める。`<Meta>` ラッパー不要の素の Markdown）。

### issue と docs の分担

策定日: 2026-07-30

**進捗と状態は issue、設計の中身と理由は docs。同じ情報を両方に書かない。**

| 情報                                   | 正本                | なぜそちらか                                                                                                                                                                                         |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 進捗、残作業、チェックリスト、担当     | issue（epic issue） | open / closed と PR リンクで状態が勝手に最新化される。docs 側は PR を切らないと更新できないため、書いた時点から古くなる                                                                              |
| 設計、選択肢の比較、なぜこの形にしたか | `docs/projects/`    | closed issue の長いコメント列からは後で発掘できない。repo にあれば `rg` で辿れ、docs-guard が鮮度とリンクを検査し、変更が PR レビューに乗る。repo しか読めない agent（plan-fact-checker 等）も読める |

- `overview.md` に進捗表・残作業リスト・「現在地」を持たせない。状態は epic issue へリンクして委ねる
- 大半の作業は issue だけで足りる。設計書が必須なのは §大規模 だけ（中規模は推奨、小規模は不要）
- 完了時は `status: done` + `summary.md` に「何を達成したか」を残す。途中経過は残さない

### 進行中

```
docs/projects/{project-name}/
├── overview.md        — Project 全体設計書
└── step-X-detail.md   — Step 詳細設計書（必要なら）
```

`overview.md` の `status` は進行中なら `active`、意図的に止めるなら `paused` とする。step文書は通常のstockとして `status: current` を使う。

または簡略形式として `docs/projects/{project-name}-detail.md` 1 ファイル。

### 完了後

Project 完了時も同じ `docs/projects/{project-name}/` に置いたまま `summary.md` を追加:

```

完了時は `overview.md` を `status: done` にし、`summary.md` を `status: current` で追加する。`done` と `summary.md` は常に同じ変更に含める。
docs/projects/{project-name}/
├── overview.md
├── step-X-detail.md
└── summary.md         — 完了時に追加（達成した成果）
```

移動時の作業:

- git mv で履歴追跡
- 内部リンクの path 修正
- `summary.md` を新規追加（Project 完了サマリー）

### src/ にはコロケーションしない

設計書は Project 単位（複数ファイル横断）の情報なので、src/ の個別コードにコロケーションしない。src/ はコード専用、設計書は `docs/projects/` に集約する。

ただし feature 単位の長期設計（ARCHITECTURE.md 相当）は feature 内コロケーションの選択肢あり。これは Project 設計書とは別物。

## Pause point（どこで止まって確認するか）

『アナタはなぜチェックリストを使わないのか』の実行層。判断層（`CLAUDE.md` §シンプルルール）が「どちらへ行くか分からない」に対処するのに対し、こちらは**正解を知っているのに複雑さの中でやり損なう**方に対処する。

**confirm リストは発動点の中に置く。この表はその地図で、リストの複製は持たない。** 参照文書（本ファイルや `plan-format.md`）は「なぜそうするか」の正本のまま維持する。

| Pause point | 発動する仕組み                                     | 強制力                                     |
| ----------- | -------------------------------------------------- | ------------------------------------------ |
| plan 提示前 | `plan-format.md` の必須セクション + `/plan-review` | 書かないと plan が成立しない               |
| push 前     | `.husky/pre-push`                                  | commit set ごとに 1 回止まる（下記の注意） |
| merge 前    | `pnpm branch:finish`                               | 機械。完了定義 5 点を満たさないと止まる    |
| session end | `/session-end`                                     | ユーザー起動                               |
| commit 前   | husky `pre-commit` / `commit-msg`                  | 機械                                       |

push 前の pause は git レベルの hook なので Claude / 人間 / wrapper script のすべてに効く。ただし**スピードバンプであってゲートではない** — 機械が強制できるのは「観点を提示して 1 回止める」までで、答えたかどうかは検証できない。黙って再実行すれば通ってしまうことを前提に、答えを発話してから再実行するのは規律の側で守る。`--no-verify` での迂回は agent には禁止（`.claude/hooks/pre-tool-guard.sh` がブロック）、人間が使う場合は理由を一言残す。

規律は 3 つ。**①機械で強制できるものは機械へ**（止まるのが最強）。**②機械化できないものだけ発動点で明示発話する**。「該当なし」も言い切り、黙って通さない。**③項目を 1 つ足すときは 1 つ削る**。長いチェックリストは形骸化するのが最悪の失敗モードなので、各点 5〜9 項目に収める。

項目に入れてよいのは**実際に抜けて事故になり、かつ再発性があるもの**だけ。仮想の心配事と一回きりの事故は入れない（一回きりは再発したら昇格させる）。各項目が何を捕まえたかの検証は `/gardening` のステップ 5。

## 共通ゲート（規模によらず）

### path-limited add

関係ない dirty ファイル（他タスクの中間状態等）を誤って staged しないよう、明示的に add する:

```bash
git add path/to/file1
git add path/to/file2
```

`git add .` は避ける。

### git diff --cached

commit 前に必ず `git diff --cached` で index 内容を確認する。Edit ツールで変更した内容が working tree のみに反映されて index に入っていないケースを防ぐ（Step C-1 事故の教訓）。

### typecheck / lint / build

中規模以上の作業では以下を必ず pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm lint:boundaries`
- `pnpm build`（routing / layout 変更時）

### push 前の敵対的セルフレビュー

外部レビュー（Codex）は push ごとに走るため、指摘 → 修正 push のラウンドがそのまま時間コストになる。effort で拾える層は push 前に自分で拾う:

- `.claude/rules/ai-behavior.md` §Read-only delegation の自動委任条件に該当する diff（auth / RLS / billing / migration / 公開契約 / cross-feature）は、**初回 push 前に**該当 subagent（`risk-reviewer` / `behavior-verifier` / `architecture-guard`）へ反証レビューをかける
- 観点は「反証」に固定する: 配線漏れ（workflow ↔ script の env 受け渡し等）、定数間の不等式（timeout / 予算）、直前の修正コミットが新たに開けた穴
- 指摘対応の push 前にも同じ確認を行う。外部レビューの指摘を直すコミット自体が新しい回帰を作る事例が繰り返し起きている（PR #1712 / #1738）
- §束ねた PR のレビュー の merge 前クロスレビューは別途維持する（あちらは束ね PR の最終確認、こちらは push ラウンド削減）

### Storybook 視覚確認

UI 変更を含む作業では、関連 Story がある場合は Storybook を起動し、Main が視覚確認する。ユーザーと画面を共有できる環境（共有 browser surface / Preview）では、同じ surface を優先する:

- 既存 stories の regression なし
- 新規 stories の描画確認
- Tomoya の確認は最終的なプロダクト判断として追加できるが、Main 自身の検証の代替にはしない

## PR 粒度

策定日: 2026-07-26

**標準は「機能のまとまり単位で 1 PR」。サイズを理由に PR を分割しない。** epic 全体、関連する複数 issue、複数 Step を 1 branch・1 PR に束ねるのを既定とする。分割したい時に理由を示す。

### 分割してよい理由（これ以外では分割しない）

- 不可逆 migration を含む変更の隔離
- code removal と destructive migration の混在回避（[time-model-split step-9](../../docs/projects/time-model-split/step-9-cleanup.md) の教訓）
- 独立して検証・revert したい変更（production release 経路など、壊れた時の影響が他と切り離される変更）

「レビューしやすいから」「1 issue だから」「大きいから」は分割理由にならない。

### 束ねた PR のレビュー

複数 issue / 複数 Step を束ねた PR は、**merge 前に read-only subagent のクロスレビューを必須**とする。対象は `.claude/rules/ai-behavior.md` §Read-only delegation の自動委任条件に該当するもの（`architecture-guard` / `behavior-verifier` / `risk-reviewer`）。PR が大きい分、人間の目視レビューだけに依存しない。

### なぜ束ねるか

Actions 課金は **PR ごとの固定費が支配的**（2026-07-25 実測）:

- CI 1 run = 18 課金分（job ごと 1 分切り上げ）。PR 1 本 ≈ 44 課金分
- PR あたりの CI run は 1.75 回。`concurrency: cancel-in-progress` が効くため、コストは push 回数ではなく **PR 本数**にほぼ比例する
- §Worktree 運用 の up-to-date gate により、他 PR が main に入るたび追従 push と CI 再実行が要る。**並行 PR N 本で追加 CI が O(N²)** に効く

個人開発で内部レビューを前提にできる以上、PR を小さく保つ便益より、本数に比例するコストと運用オーバーヘッドの方が大きい。

### 先行事例

[PR #1657](https://github.com/Dayopt/dayopt/pull/1657) は #1534 / #1535 を 1 PR に束ねた。当時は「1 issue = 1 PR の意図的な例外」としてユーザーの明示指示を根拠にしていた。本節はこの例外を既定に反転させたもの。

## PR と issue の紐づけ

策定日: 2026-08-05

**PR 本文に closing keyword を書き、merge で issue が自動で閉じる状態にする。** 手で閉じて回るのをやめ、「閉じ忘れた issue」が残らないようにする。

```markdown
Closes #1816
Closes #1808
Refs #1812
```

### 書き方の規則

- **キーワードは issue 番号ごとに繰り返す。** `Closes #1816, #1808` は **#1816 しか閉じない**（GitHub の仕様）。`Closes #1816, closes #1808` のように 1 件ずつ書く。行を分けるのが安全
- 使えるキーワードは `close / closes / closed`、`fix / fixes / fixed`、`resolve / resolves / resolved`。Dayopt では **`Closes` に統一**する（type ごとに使い分けても挙動は同じなので、揃えて grep しやすくする）
- **閉じてはいけない issue には `Refs #N` を使う。** キーワードが無ければ参照リンクだけが張られる。対象は主に次の 2 つ
  - **epic**（例 #1812）— sub-issue が全部終わってから閉じる。1 PR で閉じない
  - **部分対応**の issue — その PR で全部は終わらないもの
- **複数 issue を束ねた PR では `Closes` を人数分並べる。** [§PR 粒度](#pr-粒度) のとおり束ねるのが既定なので、これが普通の姿になる

### 効く条件（満たしている）

closing keyword が発火するのは **default branch へ merge した時**だけ。Dayopt は default branch が `main`、`branch:finish` も `main` へ merge するので条件を満たす。merge 方式（merge commit）も影響しない。

**PR 本文に書く。** commit message に書いても default branch へ入れば閉じるが、本文なら PR ページで紐づけが一目で見え、後から編集もできる。

### issue が無い作業

typo 修正など issue を切っていない作業では省略してよい。ただし `dispatch` skill の規約に沿って起票した issue がある作業では必ず書く。「issue はあるが紐づけない」は無し。

策定日: 2026-08-03

**PR は `gh pr create --draft` で作成し、ready 化は merge 直前に 1 回だけ行う。**

- **draft 中に走る軽量層**: Static Checks / Unit Tests / Docs Guard。修正ラウンドの手応え確認はこれで足りる
- **ready 後に走る重量層**: E2E / Web E2E / Production Config Audit
- flow は「draft で push を重ねる（軽量層のみ）→ ready 化 → 重量層 green を確認 → `pnpm branch:finish`」。`branch:finish` は draft を拒否する（既存挙動）
- ready 後にさらに push すると重量層も再走する。レビュー指摘の対応が続くなら `gh pr ready --undo` で draft に戻してから積む
- **外部レビューは draft のまま `@codex review` コメントで回す**（2026-08-04 に PR #1818 で実測）。Codex の自動レビューは「review 用に open」「draft を ready 化」で発火するため、これを待つとレビュー 1 ラウンドごとに ready 化が要り、そのたびに重量層が丸ごと再走する。`@codex review` は PR の状態に依存しない独立トリガーで、draft のまま 👀 → レビュー投稿まで通る。指摘が尽きてから ready 化すれば、重量層は merge 前の 1 回に収まる
- **draft skip を使う workflow は `types` に `ready_for_review` を明示する。** `pull_request` / `pull_request_target` の既定 types は `opened / synchronize / reopened` だけで、これが無いと ready 化で再発火せず、draft 時の `skipped` が残ったまま「重量層を一度も走らせずに merge できる」状態になる（2026-08-03、PR #1810 で実測）
- draft を忘れて ready で作っても機能的な regression は無い（全 push で全層が走る従来挙動に戻り、課金だけ増える）

### build と bundle 検査は Vercel 側で走る

product の `next build` と bundle 検査（client bundle への secret 混入 / JS route budget / CSS budget）は **Actions ではなく Vercel の build** で走る。配線は `apps/product/vercel.json` の `buildCommand` → apps/product の `verify:bundle`。

- Actions 側で同じ build を回すのは、Vercel の preview deploy と二重実行だった（実測 9 課金分/run）
- secret 混入検査は Vercel の方が強い。Actions の build env は placeholder しか持たないため「ハードコードされた literal」しか検出できなかった。Vercel の build は実 env を持つので、値プレフィックス（`sk_live_` 等）が実際に client へ漏れた場合も捕まる
- merge gate は維持される。build 失敗は commit status `Vercel – product` として PR の rollup に載り、`branch:finish` の失敗判定が数える
- bundle budget は報告のみだったのを `--fail` で強制に変えた。閾値は現状値に対して余裕がある（route 652/960 KB、CSS 87.5/95 KB）ので、発火するのは実際の regression の時だけ
- CSS budget の強制は `size-limit` から `check-bundle-budget.ts` へ移した。`@size-limit/preset-app` は headless Chrome を起動する（CSS に実行時間の測定は無意味で、Vercel の build 環境で browser が使える保証も無い）。`pnpm size` はローカル調査用に残っている

### なぜ 2 段階か

2026-08-03 実測: 3 日間で CI 38 run / 15 PR。push 2.5 回に対して merge 前に必要な全量検証は 1 回で、全 push で重量層まで走らせると月 ~11,000 課金分ペース（Free 枠 2,000 分の 5 倍超）だった。検証の量は減らさず、走るタイミングを merge 前 1 回に寄せる。同じ原理で Integration Tests の push:main トリガー（up-to-date gate により PR 検証と同一 tree の再検証だった）を廃止し、Production Config Audit（Vercel 側 drift の検査で PR diff と無関係）を draft skip + 日次 cron に変えた。

## マージ方式

策定日: 2026-06-17

PR は **merge commit** でマージする。GitHub リポジトリ設定で squash / rebase merge を禁止済み（`mergeCommitAllowed: true` のみ）。

### なぜ merge commit か

- ブランチの分岐・合流を main の DAG に記録し、`git log --graph` や tig / lazygit で開発の経緯を可視化できるようにするため
- squash は「PR の全コミットを 1 個に潰して親 1 つで main に載せる」ため分岐情報が一切残らず、履歴が一直線になる。後からどのブランチがいつ合流したかを復元できない

### マージ手順

標準は `pnpm branch:finish <PR番号>`（§Worktree 運用）。素の `gh` を使う場合は merge commit を明示する:

```bash
gh pr merge <PR番号> --merge --delete-branch
```

ただし `gh pr merge --delete-branch` は **削除対象 branch を checkout している worktree を main へ切り替える**。worktree の中から実行しない（[#1771](https://github.com/Dayopt/dayopt/issues/1771)）。`branch:finish` はこれを避けるため REST を直叩きする。

`--squash` / `--rebase` は使わない。GitHub 設定でハード無効化済みで、`--admin` でも merge method 制限は迂回できない。**release 手順も merge commit に統一**（[releases/process.mdx](../../apps/storybook/docs/operations/releases/process.mdx)）。squash が必要になる稀なケースでは repo 設定の変更が前提になる。

### 運用上の含意

- merge commit では**ブランチ上の各コミットがそのまま main に残る**。WIP / typo コミットを main に持ち込まないよう、1 コミット単位で意味の通る粒度・Conventional Commits 形式を守る
- revert は対象を見極める。マージコミット自体を戻す場合は `git revert -m 1 <merge-sha>`、個別コミットを戻す場合は通常の `git revert <sha>`
- マージ済みブランチは GitHub が自動削除（`deleteBranchOnMerge: true`）。ローカルでは `git branch -d` がマージを検出して安全に削除できる（squash 時代の `-D` 強制は不要になる）

### レビュー指摘の必須解決

策定日: 2026-08-04

**PR の review thread は全件 resolve してから merge する。** `branch:finish` が機械的に強制する: GraphQL `reviewThreads` を全ページ走査し、`isResolved=false` が 1 件でもあれば merge を停止する。取得失敗・20 ページ（2000 件）超は停止に倒す（fail closed、#1831 でページング対応）。

「解決」は次の 3 択のいずれか。いずれの場合も thread を resolve して閉じる:

1. **fix を積む** — 指摘どおり修正コミットを push して resolve
2. **反論を reply** — 採用しない根拠を thread に書いて resolve（黙って resolve しない）
3. **issue 化** — エッジケース等を別 issue へ切り出し、issue 番号を reply して resolve

レビューを起こすタイミングは §2 段階 CI の `@codex review`（draft のまま回す）に従う。

外部レビュー（Codex）の指摘は的中率が高い実績があるため、既定は 1。2 を選ぶ時は根拠を必ず書く（後から「なぜ見送ったか」を thread だけで追えるようにする）。3 は P2 のエッジケースや scope 外の改善が対象で、起票は dispatch skill の規約に従う。

このルールの狙いは「指摘の黙殺を構造的に不可能にする」こと。resolve の作業自体を目的化しない — 中身のない「対応済み」reply で resolve するのは 2 の違反にあたる。

#### 同型指摘の打ち切り（収束判定）

策定日: 2026-08-05

**同じ構造の指摘が 2 ラウンド連続で（修正した箇所とは別の箇所に）現れたら、fix を積むのをやめる。** 保証境界を docs に明文化し、以後の同型指摘は 2（反論 reply）で境界を根拠に resolve する。

「指摘ゼロまで回す」が原理的に終わらない問題クラスがある。代表は非トランザクショナルな外部 API への read-modify-write で、「読んだ後にもう一度読み直せ」（TOCTOU 窓）型の指摘はどれだけ対応しても 1 段深い同型指摘が構成できる。PR #1820 では 30 ラウンド超・fix 35 連続でこの型に応じ続け、script が 545 行から 2,153 行へ膨らんだ（2026-08-05。境界の明文化例は [infra.md §release の並行性モデル](../../docs/engineering/infra.md#release-の並行性モデル)）。

打ち切りは黙殺ではない。反証の基準が「指摘が構成できるか」から「明文化した保証境界を破るか」へ移るだけで、境界を実際に破る指摘には引き続き 1 で応じる。レビューの徹底度を下げる規約でもない — 徹底レビューが拾った実バグ（初期ラウンド）の価値はそのままに、到達不能なゴールへの追走だけを止める。

## Worktree 運用

策定日: 2026-07-10

**原則: 1 worktree = 1 branch = 1 PR。役目（PR の merge / close）を終えた worktree はその場で削除する。** 放置すると worktree・ブランチ・孤児ディレクトリが積み上がり、どれが生きている作業か判別できなくなる。

これは**掃除の規律であって PR のサイズの話ではない**。1 PR に何 issue・何 Step を入れるかは §PR 粒度 が決める。言い換えると、worktree は **PR の寿命と運命を共にする使い捨ての作業机**で、PR が閉じたら机ごと捨てる。

### main checkout の役割（指揮台モデル）

策定日: 2026-07-30

**repo 直下の checkout（`~/Desktop/dayopt`）は常に main に置く指揮台とし、そこでは branch を切らない・コードを変えない。** コード変更は規模によらず worktree（= branch = PR）で行う。AI セッションだけでなく、ユーザー自身の手作業も同じ扱いにする。

- **指揮台でやること**: セッション起動、レビュー、マージ（`pnpm branch:finish`）、read-only の調査・docs 閲覧
- **worktree でやること**: コードと docs の変更すべて。1 行の typo 修正も worktree で行う（規模で例外を作らない）

理由:

- 指揮台が main にあると、`pnpm branch:finish` の main 最新化がその場の `git pull --ff-only` で済み、**指揮台の作業ツリーが常に最新に保たれる**（§Worktree 運用 手順 4）。feature branch を checkout 中でもローカル main の ref は更新されるため script は止まらないが、指揮台のファイルは古いまま取り残される
- 指揮台に未コミット差分を溜めなければ、その ff pull が失敗しない。失敗しても script は続行するため気づかないまま指揮台だけが古くなる
- 手作業で `gh pr merge --delete-branch` を使う場合、削除対象 branch を checkout している worktree が main へ切り替えられる（§マージ手順）。指揮台を main に固定し、マージを指揮台から行えばこれを踏まない
- 「生きている作業 = `git worktree list` = open PR 一覧」が常に一致し、どれが進行中かを判別する手間が消える

この規律の副作用として、**「いつ worktree を使うか」を毎回判断する必要がなくなる**。コードを変えるなら常に worktree、変えないなら指揮台、の二択に畳める。

### 概念整理（branch と worktree の違い）

混同しやすいので明確にする。

- **branch** = コミット履歴を指すポインタ（ラベル）。ローカルとリモート（`origin/*`）に別々に存在する
- **worktree** = branch を実際に checkout して編集する作業ディレクトリ。1 つの repo に複数の worktree を並べ、それぞれ別 branch を同時に開ける（並行 AI セッションの土台）
- 両者は別物: **worktree を消しても branch は残る**。だから掃除では「worktree・ローカル branch・リモート branch」の 3 つを揃えて消す必要がある。「リモートだけ残る」「ローカルだけ残る」はこの 3 点の消し忘れが原因

### 命名規則

branch 名は **`{agent}/{domain}-{action}[-{issue番号}]`** で統一する。

- **agent**: 作った AI / 人を表す接頭辞。現体制では `claude`（過去の `codex/` branch は履歴にのみ残る。Codex はレビュー専任で branch を作らない）
- **domain-action**: Project 命名規則（本ファイル §Project 命名規則）と同型の kebab-case。例: `calendar-sync-fix`, `i18n-audit`, `sidebar-routing-unification`
- **issue 番号**: 対応 issue があれば末尾に付ける。例: `claude/external-calendar-sync-1705`。複数 issue を束ねた PR（§PR 粒度）では代表 issue または epic 番号を使う。例: `claude/external-calendar-1702`
- 良い例: `claude/calendar-sync-fix` / `claude/i18n-audit-1705`。悪い例: `claude/worktree-branch-strategy-9383e9`（内容が読めないランダム suffix）, `fix-stuff`（domain 不明）
- **Claude Code が自動生成するランダム suffix 名は、最初の PR を作る前に `git branch -m {agent}/{domain}-{action}` でリネームする**。worktree のディレクトリ名は使い捨てなのでリネーム不要（branch 名だけ直せば PR に正しい名前が乗る）

### 置き場と作成

- Claude Code は `.claude/worktrees/<name>/` に自動作成する（gitignore 済み）。**手動で `git worktree add` する場合も `.claude/worktrees/` 配下に置く**（repo 直下や無関係な場所に散らさない）
- `.op-env.local` は gitignore 済みのため worktree には引き継がれないが、`pnpm dev` 実行時に main checkout から自動コピーされる（`scripts/dev-with-op.sh`）。手動セットアップは不要

### マージ後の掃除（AI の責務、merge と同一セッションで実施）

**標準は `pnpm branch:finish <PR番号>` のワンセット実行。** マージ〜掃除〜main 最新化までを 1 コマンドで行う（`scripts/git/finish-branch.sh`。Claude / 人間で共通）。

```bash
pnpm branch:finish <PR番号>            # マージ→worktree削除→main ref 更新→branch削除→リモート確認
pnpm branch:finish <PR番号> --dry-run  # 実行せず予定アクションだけ確認
```

スクリプトが内部で行うこと（= 手動フォールバック時にたどる手順）:

1. PR 状態を取得。OPEN かつ失敗 check が無ければ `gh api -X PUT repos/{owner}/{repo}/pulls/<N>/merge -f merge_method=merge -f sha=<head SHA>` でマージし、`gh api -X DELETE .../git/refs/heads/<branch>` でリモート branch を削除する。**`gh pr merge` は使わない**（削除対象 branch が current だと実行元 worktree を main へ切り替えてしまう）。REST 直叩きなら構造的にローカル git へ触れない。`sha` は check 判定後に積まれた未検証 commit ごとマージするのを防ぐ
   - check 判定は **`statusCheckRollup` を畳んでから**行う。rollup は同名 check を畳まないため（`gh pr checks` は畳む）、同一 head SHA で 2 回 run が走ると古い run の failure / cancelled を数え続けてマージ不能になる。代表は「最新を採る」ではなく **① 実行中があれば実行中 → ② 判定を持つ entry の最新 → ③ それも無ければ最新** の順で選ぶ。②が要るのは `skipped` が失敗にも成功にも数えられないためで、**古い `failure` は新しい `skipped` より優先される**。詳細と根拠は [infra.md §merge gate の required checks](../../docs/engineering/infra.md#merge-gate-の-required-checks)、契約は `scripts/__tests__/finish-branch.test.ts` が固定する
   - audit contract 保護対象（`scripts/production-config-audit.mjs` / 各 `production-build-gate.mjs` / `production-config-audit.yml`）を変更する PR では、check run「Audit Vercel metadata (trusted)」が**設計として必ず failure になる**。解除は **push ごとに** `gh workflow run production-config-audit.yml --ref <branch>` の trusted dispatch を実行する（branch 側の code に `VERCEL_TOKEN` を渡すため、diff レビュー後にユーザーの明示指示で実行する）。成功すると commit status「Production Config Audit」が head SHA へ success で発行され、`branch:finish` は **この status が success の時に限り** guard の failure を失敗数から除外する（dispatch run の check run は PR の rollup に紐づかず、畳み込みでは解消できないため）。status が failure のまま（dispatch 未実行 / audit 実失敗）なら従来どおり停止する
   - **dispatch は「push で起動した `pull_request_target` の audit run が完了してから」実行する。** 両者は同じ commit status context（`Production Config Audit`）へ書き込むため、先に dispatch を流すと後から完了した PR 側 run の failure に上書きされる（2026-08-03、PR #1810 で実測。success の 5 秒後に failure が上書きした）。順序を守れば PR 側 run の failure を dispatch の success が上書きする
2. 該当 branch の worktree を特定し、`status --porcelain` が空であることを確認（**dirty なら停止**してユーザーに委ねる）
3. `git worktree remove --force <path>` で worktree を解除
4. `git fetch --prune` → ローカル `main` を最新化する（**branch 削除より先に**）。**`checkout` は使わない**（main checkout が別セッションの branch にいる場合、それを奪ってしまう）。main を checkout 中の worktree があればその場で `git pull --ff-only origin main`、どこも checkout していなければ `git fetch origin main:main` で ref だけ fast-forward する。失敗しても停止しない（判定は次の手順が担保する）
5. `git -C <main> branch -d <branch>`。失敗した場合は `git merge-base --is-ancestor <branch> main` で main への到達を確認し、**真なら `-d` の偽陰性なので `-D` で削除、偽なら停止**
6. リモートに `origin/<branch>` が残っていれば `git push origin --delete <branch>` → `git worktree prune`

順序に意味がある: ① **worktree が参照する branch を先に解除しないと branch 削除が不可能**なため `worktree remove` を先に行う。② **branch 削除の前にローカル main を最新化する**（マージは REST 経由でリモートしか更新しないので、更新前だと branch 先端がローカル main から辿れず「未マージ」と判定される）。スクリプトが途中で停止した場合（dirty / main 未到達）は、下記「削除時の安全確認」に従って手動で判断する。

手順 4・5 が「**どの worktree の HEAD も切り替えない**」設計なのは、並行 worktree 環境で main checkout が別セッションの branch にいるのが常態だから（[#1771](https://github.com/Dayopt/dayopt/issues/1771)）。`branch -d` は **HEAD 基準**でマージ済みを判定するため、HEAD が別 branch だと main へ完全にマージ済みの branch でも拒否される。この偽陰性を main 基準の判定で訂正する。なお main を checkout 中の worktree では ff pull がその作業ツリーのファイルを更新する（branch は切り替えない）。

### 完了定義（ワンセット）

以下 5 点すべてを満たして初めて「作業終了」とする。1 つでも欠けたら未完了（「リモートだけ残る」等はこの積み残し）。

1. PR がマージ済み
2. worktree が削除済み
3. ローカル branch が削除済み
4. リモート branch が消滅（`git fetch --prune` 後に `origin/<branch>` が無い）
5. ローカル `main` ref が `origin/main` と一致（main checkout がどの branch にいるかは問わない。別セッションの作業を切り替えてまで main を checkout させない）

`pnpm branch:finish` はこの 5 点を満たすと完了サマリーを出す。手動で進めた場合も同じ 5 点を自分で確認する。

### 削除時の安全確認

- 削除前に `git -C <worktree-path> status --porcelain` が空であることを確認する。未コミット差分が残る worktree はユーザー作業として扱うため、消去前に確認を取る
- **`rm -rf` で worktree を直接消さない**。git の管理情報が残って孤児化する。必ず `git worktree remove` を使う
- gitignore された生成物（`.next/` 等）だけが残って `remove` が拒否される場合は、tracked ファイル差分がないことを確認した上で `git worktree remove --force`
- `git branch -d <branch>` が `not fully merged` で失敗したら、原則 `-D` は使わずユーザー確認を取る（保留/close の再確認、必要なら別 PR 化）。例外は `git merge-base --is-ancestor <branch> main` で **main への完全マージを検証済み**の場合だけ（`branch:finish` の手順 5）。この条件下の `-D` は強制削除ではなく、HEAD 基準判定の偽陰性の訂正にあたる

### 定期掃除（月次 sweep で実施）

```bash
git worktree list          # 全 worktree と branch の対応を俯瞰
git worktree prune         # 手動削除などで孤児化した管理情報を掃除
git branch --merged main   # merge 済みローカルブランチ → git branch -d で削除
```

`git worktree list` に出ないのに `.claude/worktrees/` 配下に残っているディレクトリは孤児（過去の削除で gitignore 生成物だけが残った残骸）。中身が生成物のみであることを確認して削除する。

## 実例の参照先

各規模の実例:

**大規模**:

- `sidebar-routing-unification`（8 コミット / Phase 全体設計書 + Step 4 詳細）
- `sidebar-3-mode-structure`（7 コミット / Phase 全体設計書 + 各 Step 詳細）

**中規模**:

- （未実施、将来 `feature-colocation-migration` が該当予定）

**小規模**:

- フォローアップ作業群（typo 修正、namespace 追加、etc.）

詳細は `docs/projects/` 配下の各 project ディレクトリを参照。
