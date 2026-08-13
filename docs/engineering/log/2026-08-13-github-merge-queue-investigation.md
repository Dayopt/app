---
status: frozen
date: 2026-08-13
---

# GitHub Merge Queue の導入を見送る（現行の直列 merge 運用を維持する）

## 背景・当時の前提

[#1997](https://github.com/Dayopt/dayopt/issues/1997)。2026-08-12 の指揮台運用で、merge 直列運用（追従 → ready 化 → CI 監視 → `branch:finish` → 次レーンへ合図）が完全に手作業で、二重追従・先行追従・CI 待ちの張り付きが実際に発生した（`.claude/rules/orchestration.md` §追従とマージ順の采配）。GitHub native の Merge Queue がこの列管理を自動化できないかを調査する（User 承認済み）。

Dayopt の現行運用の前提（本調査時点）:

- open PR は直列 1 本ずつ回す。並行 PR は増やさない方針（[workflow.md §PR 粒度](../../../.claude/rules/workflow.md#pr-粒度)）
- 2 段階 CI: draft 中は軽量層（Static Checks / Unit Tests / Docs Guard）だけが走り、ready 化後に重量層（E2E / Web E2E / Production Config Audit / Vercel build）が走る（[workflow.md §2 段階 CI](../../../.claude/rules/workflow.md)）
- マージ方式は merge commit 固定（squash / rebase は repo 設定で無効化済み。`gh api repos/Dayopt/dayopt` で `allow_squash_merge: false` / `allow_rebase_merge: false` / `allow_merge_commit: true` を実測確認）
- main ruleset の required status checks（実測: `gh api repos/Dayopt/dayopt/rulesets/6790553`）は 🔍 Static Checks / 📦 Unit Tests / 🎭 E2E Tests / 🌐 Web Build & E2E / Production Config Audit / Vercel – product / Vercel – web / 🛡️ docs & secrets guard の 8 件で、`strict_required_status_checks_policy: true`（up-to-date 要求）が既に有効
- merge 自体は `pnpm branch:finish` が担う。GitHub の merge ボタンではなく REST 直叩き（`gh api -X PUT .../merge`）で、**外部レビュー痕跡 gate**（`.claude/rules/workflow.md` §外部レビューの実施を要求する gate）と**review thread 全 resolve gate**（同 §レビュー指摘の必須解決）をスクリプト側で検査してから実行する
- CI コスト実測（[workflow.md §なぜ束ねるか](../../../.claude/rules/workflow.md#なぜ束ねるか)）: CI 1 run ≈ 18 課金分、PR 1 本 ≈ 44 課金分。2026-09 の private 化で無料枠は月 2,000 分になる

## 決定と理由

**導入を見送る。設定変更（Merge Queue の有効化）は行わない。** 直列 merge の手作業負担は、Merge Queue ではなく「push タイミングの一元化」（`.claude/rules/orchestration.md` §push タイミングの一元化）と「指揮台の merge シーケンス」の運用手順で吸収する方針を維持する。

理由は 3 つ、いずれも単独で見送りに足る:

### 1. Vercel required check が merge queue に対応するか未確認で、対応していない場合は queue が恒久的に詰まる

Merge Queue は対象 PR を target branch 最新 + queue 内の他 PR と組み合わせた一時 ref（`gh-readonly-queue/{base}/...`）を作り、そこに対して required status check の報告を待つ（[GitHub Docs: Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)）。GitHub Actions で実行する check は `on: merge_group:` トリガーを workflow に追加しないと、この一時 ref に対して起動すらしない。

**`Vercel – product` / `Vercel – web` は GitHub Actions ではなく Vercel の GitHub App が発行する check** で、Dayopt はこれを required status check に含めている。Vercel 公式ブログ「[Deploying safely on Vercel without merge queues](https://vercel.com/blog/deploy-safely-on-vercel-without-merge-queues)」は「merge queue はコミットを少なくとも2回テストする重複」「無関連なコミット同士を直列でテストする待ち時間」を欠点として挙げ、**Vercel 自身が merge queue の代替（promote 前の webhook 検証）を推奨する立場**を取っている。この記事は GitHub の `merge_group` イベント・`gh-readonly-queue` ref への対応可否には触れておらず、**Vercel の GitHub App が merge queue の一時 ref に対して build・check を発行するかは今回の調査で確認できなかった**。

対応していない場合、`Vercel – product` / `Vercel – web` は merge queue の一時 ref に対して永遠に check を報告しないため、**その PR は queue に入ったまま進行不能になる**。これは「試してみて駄目なら戻す」で済む話ではなく、**queue に入れた瞬間に他の待機中 PR も巻き込んで詰まる**（Dayopt は直列 1 本運用だが、詰まった 1 本が後続を止める点は変わらない）。

### 2. 独自 gate（外部レビュー痕跡・trusted dispatch）が merge queue の自動 merge と構造的に相容れない

`branch:finish` の merge 実行は、**スクリプトが GitHub の状態を検査してから `gh api` で merge する**という順序で動く（§外部レビューの実施を要求する gate・§レビュー指摘の必須解決）。Merge Queue は逆で、**required status check が揃った時点で GitHub 自身が自動的に merge する**。この 2 つを両立させるには、`branch:finish` が行っている検査（外部レビューの痕跡 3 経路照合、review thread 全 resolve）を **required status check（= 実際に走る CI job）として作り直す**必要がある。

- **review thread resolve**: ruleset の `required_review_thread_resolution: true` が既に native 機能としてカバーしており、これは queue 投入前提条件として自然に効く。**この 1 点だけは移行コストが低い**
- **外部レビューの痕跡 gate**: 現状は `branch:finish` が GraphQL で PR の reviews / reviewThreads / issue comment を都度取得し、`[no-external-review]` marker や Codex の応答有無を判定する。これを CI job 化するには、`merge_group` イベントでも同じ判定ロジックを動かし、判定結果を status check として発行する仕組みを新設する必要がある。現状ロジックは「その時点の PR 状態」を都度クエリする設計で、`merge_group` の一時的な synthetic commit に対して同じ意味を持つかも設計し直しが要る
- **audit contract 保護対象の trusted dispatch**: `Production Config Audit` は `pull_request_target`（trusted base）実行 + 保護対象ファイル変更時の手動 `workflow_dispatch` trusted dispatch という**人間の判断を挟む例外フロー**を前提にしている（[workflow.md §指揮台の merge シーケンス](../../../.claude/rules/workflow.md#指揮台の-merge-シーケンス)手順 3・5）。Merge Queue は「required check が揃ったら自動 merge」が前提のため、この人間判断ステップを queue の中に維持する標準的な方法が無い（allow-list 化した bot アカウントに dispatch させる等の再設計が要る）

これらはいずれも「使えない」ではなく「作り直せばおそらく使える」種類の課題だが、**現状の gate 設計思想（スクリプトが判断してから動く）と Merge Queue の設計思想（check が揃ったら自動で動く）が逆向き**である以上、単純な有効化では済まない。

### 3. Dayopt の運用は既に直列 1 本なので、Merge Queue が解決する問題がそもそも存在しない

Merge Queue の主要な価値は「複数 PR が並行して approve され、それぞれ単体では通っても組み合わせると壊れる（semantic conflict）」を防ぐことにある。Dayopt は [workflow.md §PR 粒度](../../../.claude/rules/workflow.md#pr-粒度)で **open PR を原則 1 本に保ち直列で回す**運用を既に敷いており、この問題は構造的に発生しない。

Actions コストの観点でも逆効果になりうる。Merge Queue は `merge_group` イベントで required check を**都度再実行**する（[GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)、および複数の実務記事が指摘する「individual PR と merge group の両方でテストが走り、CI 負荷が増える」という副作用）。現状の 2 段階 CI（draft = 軽量、ready = 重量 1 回）に Merge Queue を足すと、**ready 化後の重量層 1 回 + queue 投入時の merge_group 重量層 1 回**で単純に 2 倍になるか、あるいは ready 時点の重量層を廃止して merge_group 実行だけに寄せるかの再設計が要る。後者を選んでも、queue 投入 = 実質的な ready 化のタイミングでしかなく、**現状の「ready 化 → 重量層 green を待つ → branch:finish」と比べて Actions run 数が減る理由が無い**（Dayopt は 1 本ずつしか queue に入れないため、複数 PR をまとめて 1 回で検証するメリットも得られない）。

2026-09 の private 化で無料枠が月 2,000 分になる制約下では、**根拠なく Actions run を増やしうる変更は採用しない**という判断が妥当（[workflow.md §Actions 経済の規律](../../../.claude/rules/workflow.md#actions-経済の規律-策定日-2026-08-12)と同じ規律）。

## 却下した選択肢と、なぜ捨てたか

- **Merge Queue をひとまず有効化し、動かしながら互換性を確認する** — 却下。§決定と理由 1 の通り、Vercel check が対応しない場合は queue が詰まる恒久障害になりうる。設定変更は `EXPLICIT AUTHORITY` 隣接（本 issue の注記どおり）であり、「試してみる」を正当化するには互換性の未確認リスクが大きすぎる
- **Vercel check だけ required から外して Merge Queue を使う** — 却下。`Vercel – product` / `Vercel – web` を required から外すと、production build の成否を merge gate が保証しなくなる。Merge Queue 導入のために既存の保証を弱めるのは本末転倒
- **独自 gate をすべて捨てて GitHub native の仕組みだけに寄せる** — 却下。外部レビュー痕跡 gate は「レビューが無いまま merge した PR を後から識別できる」ための仕組み（[workflow.md §外部レビューの実施を要求する gate](../../../.claude/rules/workflow.md#外部レビューの実施を要求する-gate)）で、native な required status check だけでは代替できない（reviews が 0 件の PR と「レビューさせ忘れた」PR を機械的に区別する情報を native 機能は持たない）

## 影響・やること

- Merge Queue の有効化（ruleset への `merge_queue` rule 追加）は行わない。現状の `.claude/rules/orchestration.md` §追従とマージ順の采配・§push タイミングの一元化・§指揮台の merge シーケンスの手動運用を維持する
- 直列 merge の手作業負担そのものへの対処は、Merge Queue とは別の切り口（例: 指揮台側の定型作業をさらにスクリプト化する）で今後検討する。本 issue の scope 外
- 将来 Dayopt が並行 PR 運用へ方針転換する場合（現状の想定は無い）、または GitHub / Vercel 側で `merge_group` 対応が明確に確約された場合は、本ログを起点に再調査する

## 参考

- [GitHub Docs: Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [Vercel Blog: Deploying safely on Vercel without merge queues](https://vercel.com/blog/deploy-safely-on-vercel-without-merge-queues)
- `gh api repos/Dayopt/dayopt` / `gh api repos/Dayopt/dayopt/rulesets/6790553`（2026-08-13 実測、本ログの前提データ）
