---
title: CodeQL を無効化し、private 化は保留する
status: frozen
date: 2026-08-11
code:
  - docs/engineering/infra.md
  - .github/workflows/docs-guard.yml
---

# CodeQL を無効化し、private 化は保留する（#1934）

[#1934](https://github.com/Dayopt/dayopt/issues/1934) で、[2026-07-26 のコスト実測ログ](./2026-07-26-pr-granularity-actions-cost.md)が
「**要確認（外部設定）**」として残した CodeQL の宿題と、[2026-08-05 の visibility ログ](./2026-08-05-repo-visibility-state.md)が
「**未確認（ユーザーにしか分からないこと）**」として残した private 化の条件を、まとめて決めた。

## 背景・当時の前提

### CodeQL はアプリコードを 1 行も解析していなかった

```bash
gh api repos/Dayopt/dayopt/code-scanning/default-setup
# => {"state":"configured","languages":["actions"],"query_suite":"default",
#     "threat_model":"remote","schedule":"weekly","runner_type":"standard"}

gh api 'repos/Dayopt/dayopt/code-scanning/analyses?per_page=20' --jq '.[]|.category' | sort | uniq -c
# =>  20 /language:actions
```

対象言語は `actions` だけで、`apps/` 配下の JavaScript / TypeScript は解析対象に入っていなかった。
つまり CodeQL は **GitHub Actions の workflow YAML しか見ていなかった**。

これは [#1425](https://github.com/Dayopt/dayopt/issues/1425)（`Verify and enable CodeQL analysis`）の
Done 条件「JavaScript / TypeScript が対象になっていることを確認する」が
**満たされないまま `COMPLETED` で close されていた**（2026-06-29）ことを意味する。
チェックボックスを埋めずに close した結果、以後 1 年近く「CodeQL が有効になっている」という
誤った前提が docs に残り続けた。**外部設定の Done 条件は、設定画面を開いた事実ではなく
API の応答で確認する。**

### docs が 2 箇所で矛盾していた

| 箇所                                                                                                         | 記述                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [infra.md](../infra.md) §GitHub 品質サービス                                                                 | 「セキュリティ静的解析は GitHub CodeQL を継続する」                                                                                    |
| [2026-07-27 セキュリティレビュー体制の監査](../../operations/log/2026-07-27-security-architecture-review.md) | **採らなかった選択肢**として「CodeQL / GitHub Advanced Security: private repo で有料、深掘り SAST の席は `/claude-security` が埋める」 |

どちらが正本か決まっておらず、しかも実態（actions のみ解析）はどちらとも一致していなかった。

### コストの実測（2026-08-04 09:33Z 〜 08-11 01:37Z、約 6.7 日）

| workflow                | run 数 | 課金分/月（public 実測） | private 換算/月（投影） |
| ----------------------- | -----: | -----------------------: | ----------------------: |
| CI                      |    205 |                   ~6,900 |                 ~11,900 |
| CodeQL                  |    191 |                     ~858 |                  ~1,716 |
| Docs Guard              |    153 |                     ~687 |                  ~1,374 |
| Integration Tests       |    121 |                     ~543 |                  ~1,086 |
| Production Config Audit |    272 |                     ~536 |                    ~536 |
| Production Release      |     51 |                     ~457 |                    ~457 |
| **合計**                |        |               **~9,980** |             **~17,000** |

private 換算は「public 4 core / private 2 core で CPU 依存 job は概ね 2 倍」という
[2026-08-05 の visibility ログ](./2026-08-05-repo-visibility-state.md)の前提に基づく**投影であって実測ではない**。

## 決定と理由

### 1. CodeQL は完全無効化する

GitHub の default setup を disable にする（Settings → Code security → Code scanning → CodeQL analysis）。
repo 内に変更するファイルは無い。

- **失うのは workflow YAML の静的解析だけ。** アプリコードは元から対象外だったため、
  無効化によって新たに失われる検査は存在しない
- secret / 依存の検出は gitleaks・`pnpm secrets:check`（ともに [docs-guard.yml](../../../.github/workflows/docs-guard.yml)）・
  Dependabot が担い、深掘り SAST の席は `/claude-security` が埋める。
  [2026-07-27 の監査](../../operations/log/2026-07-27-security-architecture-review.md)の 4 層構造は CodeQL に依存していない
- **CodeQL は required status checks に入っていない**ため merge gate に影響しない。
  現在の required checks 8 件は `🔍 Static Checks` / `📦 Unit Tests` / `🎭 E2E Tests` / `🌐 Web Build & E2E` /
  `Production Config Audit` / `Vercel – product` / `Vercel – web` / `🛡️ docs & secrets guard`
- **可逆。** UI からいつでも再有効化できるため `EXPLICIT AUTHORITY` には当たらない

### 2. docs の正本は infra.md、内容は 2026-07-27 の監査に揃える

[infra.md](../infra.md) の「セキュリティ静的解析は GitHub CodeQL を継続する」を、
無効化した事実と代替の担当（gitleaks / `secrets:check` / Dependabot / `/claude-security`）に書き換えた。
これで [2026-07-27 の監査](../../operations/log/2026-07-27-security-architecture-review.md)の
「採らなかった選択肢」と矛盾しなくなる。

**凍結 log は本文を触らない。** [2026-07-21 の Code Quality 判断ログ](./2026-07-21-github-code-quality-disabled.md)にも
「セキュリティ静的解析は CodeQL を継続する」とあるが、これは**当時そう判断した記録として正しい**ため
`superseded_by` は付けない（Code Quality を採用しないという同ログの主題は現在も有効で、
`superseded_by` を付けると主題ごと引用不可になってしまう）。現在の正は stock である infra.md 側が持つ。

### 3. private 化は保留し、public を維持する

[2026-08-05 の visibility ログ](./2026-08-05-repo-visibility-state.md)が残した
「**9 月に private 化する条件は何か**」への回答: **条件を設けず、当面 public を維持する。**

決め手は算術。private 換算 ~17,000 分/月に対し Free 枠は 2,000 分で、**88% の削減が要る**。

- CodeQL（~1,716 分）と Docs Guard（~1,374 分）を全廃しても、**CI 単体が ~11,900 分**を占める
- したがって「CI 削減が完了したら private 化する」は条件として成立しない。
  達成不能な条件を掲げると、実質は無期限保留なのに「いつか達成される」という誤った期待が残る
- private 化の駆動理由（なぜ private にしたいのか）は docs にも git log にも記録が無い。
  理由が不在のまま超過 ~15,000 分 ≒ **$120/月**を払う根拠は無い

再検討する時は、コスト削減の完了ではなく **private にする事業上の理由が生じた時点**で行い、
その時点で「$120/月を払う」か「self-hosted runner を導入する」かを比較する。
self-hosted runner は本 issue の scope 外で、必要になった時点で別 issue を起票する。

**この決定によって [2026-08-05 の visibility ログ](./2026-08-05-repo-visibility-state.md)は superseded になる。**
同ログの残る未確認事項「いつ、なぜ public に戻したのか」は本ログでも解明していないが、
public 維持を決めた以上、遡って解明する必要が無くなった。

### 4. Docs Guard の 1 分化は実施しない

[#1934](https://github.com/Dayopt/dayopt/issues/1934) は「gitleaks バイナリの `curl` + `sha256sum` + `install` が
35 秒のうち何秒を占めるか」を先に計測せよと指示していた。計測した結果、**前提が誤りだった**。

直近 20 run（success）の `GET /actions/runs/{id}/jobs`:

| 指標                      |                                  値 |
| ------------------------- | ----------------------------------: |
| job 合計                  | 中央値 **35s**（min 27s / max 39s） |
| gitleaks インストール     |     平均 **0.2s**（20 run 合計 5s） |
| `./.github/actions/setup` |      平均 **20.5s**（job の約 60%） |

GitHub releases はランナーと同一ネットワークにあるため、バイナリ取得は 1 秒未満で終わっていた。
**cache を入れても削減幅は 0.2 秒**で、1 分課金（private 換算 ~70s → 60s 未満）に収めるのに必要な
5 秒以上には遠く及ばない。

残る唯一の大玉は共有 composite action の `./.github/actions/setup`（20.5s）だが、
これは `actions/setup-node` の pnpm store cache + `pnpm install --frozen-lockfile` で既に最適化済みで、
全 workflow が共有している。ここを触ると blast radius が CI 全体に広がり、
「Docs Guard を 1 分に収める」という目的に対して割に合わない。
`setup` は `secrets:check` / `docs:check` / `validate:content` の 3 step すべてが必要とするため、
条件付き skip もできない。

したがって [docs-guard.yml](../../../.github/workflows/docs-guard.yml) は変更しない。
private 化を保留した以上、この 2 分課金が現実の支出になる予定も当面無い。

### 5. update-branch 後は run の完走を待つ。close→reopen を復旧手順にしない

GitHub の update-branch 後に required checks が `expected` のまま残り merge 不能に見える事象について、
「CI workflow が発火していない」という診断が立てられていたが、**実測で否定された**。

PR [#1931](https://github.com/Dayopt/dayopt/pull/1931) / [#1932](https://github.com/Dayopt/dayopt/pull/1932) を
`gh run list --branch <branch> --json headSha,event,conclusion` で突合したところ、
**update-branch が作った新しい head SHA に対して、どちらの PR でも `event=pull_request` の run が発火していた**
（#1931 は 01:18:54、#1932 は 01:49:18）。発火しなかった head SHA は 1 件も無い。
update-branch が生む push は `synchronize` イベントで、[ci.yml](../../../.github/workflows/ci.yml) の
`types: [opened, synchronize, reopened, ready_for_review]` に元から含まれている。

実際に起きていたのは逆で、**close→reopen が、まだ走っている run をキャンセルしていた**
（`concurrency.cancel-in-progress: true` の設計どおりの挙動）。#1931 では reopen の 3 秒後に
update-branch の run が cancelled になり、#1932 では E2E 実行中の run が捨てられた。
決定的だったのは、**キャンセルされた側の run でも `🎭 E2E Tests` が SUCCESS で完走していた**こと。
つまり元から green になる軌道にあり、close→reopen は不要どころか重量層を丸ごと再実行させていた。

#1932 は 02:00Z 時点で `BLOCKED` だったが、**介入なしで 02:06Z に `CLEAN` へ解消した**。
`CANCELLED` が rollup に残っていても GitHub 側の required check 判定は CLEAN になり、
[finish-branch.sh](../../../scripts/git/finish-branch.sh) の畳み込み（「① 実行中 → ② 判定を持つ最新 → ③ 最新」、
正本は [infra.md §merge gate の required checks](../infra.md#merge-gate-の-required-checks)）と整合した。

したがって運用は次のとおり:

- **update-branch 後に required checks が `expected` や `pending` に見えても、run の完走を待つ。**
  `🚦 Impact gate → static / unit / e2e / web` という `needs` 構造上、run 開始直後は下流 4 job が
  rollup に現れないため、起動途中を「発火していない」と誤読しやすい
- **close→reopen を復旧儀式として使わない。** 1 回で private 換算 ~13 分（重量層を含む CI 1 run）を捨てる
- 完走を待っても解消しない事象が観測された場合に限り、**run ID と rollup 状態を添えて**再調査する
- **[ci.yml](../../../.github/workflows/ci.yml) の `types:` は変更しない。** `synchronize` は既に含まれ、
  実測でも発火している。ここを触ると 2026-08-03 に `ready_for_review` を明示追加した際の設計意図を壊す

### 6. `productUnit=false` の skip 経路は検証済みになった

[2026-08-05 の Unit 計測ログ](./2026-08-05-unit-test-cost-measurement.md)が「未確認」として残した
「`productUnit=false` で実際に skip される経路は未検証」は、#1934 の調査で解消した。
直近 60 CI run をサンプルしたところ、`📦 Unit Tests` job の `Product unit tests` step が
**3 件で `skipped`**、40 件で `success` だった。**skip 経路は実際に発火している。**

同ログは凍結されているため本文は書き換えない。この 1 行が同ログの宿題への回答にあたる。

## 却下した選択肢と、なぜ捨てたか

**(b) CodeQL の push:main トリガーだけ外す**（削減 ~440 分/月）:
`GET /code-scanning/default-setup` が返すのは `state` / `languages` / `query_suite` / `threat_model` /
`schedule` / `runner_type` だけで、**トリガーを制御するフィールドが無い**。default setup のままでは実行不能で、
advanced setup（`.github/workflows/codeql.yml` の新規作成と恒久的な保守）へ移行しないと選べない。
「他 workflow と揃えるだけ」の効果に対し、保守対象が 1 つ増える代償が見合わない。

**(c) advanced setup へ移行して JS/TS を追加する**: CodeQL 本来の価値（アプリコードの脆弱性解析）は得られるが、
コストは増加方向。private 化のコストを抑える文脈で逆行する。深掘り SAST の席は `/claude-security` が埋めており、
[2026-07-27 の監査](../../operations/log/2026-07-27-security-architecture-review.md)がその整理を済ませている。

**private 化を「CI 削減の完了」を条件に倒す**: 上の算術どおり CI 削減では Free 枠に届かないため、
条件として成立しない。達成不能な条件は無期限保留を「進行中」に見せかける。

**spending limit を引き上げて private 化する**: 実課金（~$120/月）で `EXPLICIT AUTHORITY` に当たるうえ、
private にする事業上の理由が記録されていない。理由が出た時点で改めて判断する。

**`🚦 Impact gate` job の削除**: waste 率 87.6%（実測 7 秒で 1 分課金）で削減候補に見えるが、
CI 70 run のサンプル実測でコスト 69 分に対し Static / Unit の docs-only skip だけで 90 分以上を節約しており純減。
[ci-monorepo-refactor/overview.md §Phase 5](../../projects/_archive/ci-monorepo-refactor/overview.md) が
gate job の 1 分課金を明示的に織り込んで設計している。

**Production Config Audit の push:main（~224 分/月）の廃止**: `create-release.yml` が
`Production Config Audit` status を gate に使っているため、外すには release 経路への影響検証が要る。
見返りに対して検証コストが見合わない。

## 影響・やること

- [ ] GitHub UI で CodeQL default setup を disable にする（**User 操作**。Settings → Code security →
      Code scanning → CodeQL analysis → Disable CodeQL）
- [x] [infra.md](../infra.md) の CodeQL 記述を実態に合わせる
- [x] [2026-08-05 の visibility ログ](./2026-08-05-repo-visibility-state.md)に `superseded_by` を追記する
- [x] Docs Guard は変更しない（計測値は #1934 のコメントに記録済み）

無効化後の確認:

```bash
# 新規 analysis が増えないこと（数日おいてから）
gh run list --limit 300 --json workflowName --jq '[.[]|select(.workflowName=="CodeQL")]|length'

# required checks が 8 件のまま変わっていないこと
gh api repos/Dayopt/dayopt/rulesets/6790553 \
  --jq '.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context'
```
