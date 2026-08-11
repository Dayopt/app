---
title: repo が public に戻っている（private 化の記録との食い違い）
status: frozen
date: 2026-08-05
last_verified: 2026-08-05
superseded_by: docs/engineering/log/2026-08-11-codeql-disabled-and-visibility-decision.md
---

# repo が public に戻っている（private 化の記録との食い違い）

[2026-07-24 のログ](./2026-07-24-repo-private-and-ci-strategy.md)は「repo を private 化した」で終わっているが、
2026-08-05 時点で **repo は public に戻っている**。その判断の記録が docs にも git log にも無い。
9 月に再び private 化する前に、前提が食い違ったまま議論しないための記録として残す。

## 実測（2026-08-05）

```bash
gh repo view Dayopt/dayopt --json isPrivate,visibility
# => {"isPrivate": false, "visibility": "PUBLIC"}

gh api repos/Dayopt/dayopt/actions/runs/<id>/timing --jq .billable
# => 全 job で duration_ms: 0（public repo の署名。private なら実課金 ms が入る）
```

2026-07-24 〜 2026-08-05 の CI run を遡って確認したが、**この期間の全 run で billable が 0**。
つまり少なくともこの期間はずっと public だった。

## これが効いていること

1. **Actions 課金は現在ゼロ。** [2026-07-26 のコスト実測ログ](./2026-07-26-pr-granularity-actions-cost.md)の
   「PR 1 本 ≈ 44 課金分」「並行 PR N 本で O(N²)」は private を前提にした数字で、
   いまは金額として発生していない。CI 最適化の便益が実際に出るのは private 化以降
2. **runner のスペックが倍違う。** GitHub の standard hosted runner は
   **public 4 core / 16GB、private 2 core / 8GB**
   （[公式](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)）。
   private 化で CPU 依存の job はおおむね倍の時間になる。
   実測と見積もりは [同日の Unit 計測ログ](./2026-08-05-unit-test-cost-measurement.md)
3. **branch protection / required check の扱いが変わる。** private + Free plan では GitHub 側の
   強制が効かないため `scripts/git/finish-branch.sh` の 3 ゲートが唯一の防波堤になる。
   public の間は ruleset が効くので二重になっている

## 未確認（ユーザーにしか分からないこと）

- **いつ、なぜ public に戻したのか。** 記録が無いため本ログでは断定しない
- **9 月に private 化する条件は何か。** 「CI 最適化がどこまで進んだら」なのか、
  日付固定なのか

private 化を実施する時は、上の 2 点を決定ログとして残し、本ログを superseded にする。
その際 [infra.md](../infra.md) の merge gate の記述（ruleset と `finish-branch.sh` の
二重化が解ける）も併せて見直す。
