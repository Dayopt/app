---
status: frozen
date: 2026-07-30
---

# main checkout を指揮台に固定し、worktree 使用の判断基準を明文化する

## 背景・当時の前提

- [2026-07-24 の worktree / branch 統一](./2026-07-24-worktree-branch-unification.md)で概念整理・命名規則・掃除の完了定義は揃ったが、**「いつ worktree を使い、main checkout をどう使うか」の判断基準はどこにも書かれていなかった**。ユーザーは「1 worktree = 1 branch = 1 PR にメリットを感じない」「main checkout の作業と worktree の作業が混在して変な感じがする」と再度混乱していた
- 「1 PR」という字面が [§PR 粒度](../../../.claude/rules/workflow.md#pr-粒度)（2026-07-26 に「束ねるのが標準」へ逆転）と衝突して見えることも、ルールの意図が伝わらない一因だった。実体は掃除の規律で、PR のサイズとは無関係
- 2026-07-30 時点の実態: 指揮台であるべき `~/Desktop/dayopt` が `claude/design-system-worldview-1757` + 未コミット差分で占有され、同時に worktree 3 レーン（`claude/issue-1754-progress-ccac4c` / `claude/mcp-timeblock-acl-cutover-1754` / `codex/mcp-plan-track-learn`）が走っていた。この状態で `pnpm branch:finish` を実行すると、`scripts/git/finish-branch.sh` が main checkout で `git checkout main` → `git pull --ff-only` を無条件に行うため、詰まるか他作業の差分を巻き込む
- ツール側はすでに「main checkout は main に居る」前提で書かれていた（`MAIN_ROOT` を `git-common-dir` から解決して直接 checkout する）。rules 側にその前提が書かれていないという非対称があった

## 決定と理由

**repo 直下の checkout を「常に main に置く指揮台」と定義し、コード変更は規模によらず worktree で行う。**

- **指揮台の用途を限定する**: セッション起動、レビュー、マージ（`pnpm branch:finish`）、read-only の調査。ここで branch を切らない
- **規模で例外を作らない**: 1 行の typo 修正も worktree で行う。「小さいから main checkout で」を許すと、その判断自体が毎回のコストになり、並行セッションと衝突する条件を人間が読み切れない
- **ツールの前提と rules を一致させる**: `finish-branch.sh` の無条件 `checkout main` / `pull --ff-only` が安全に成立する状態を、rules 側で保証する
- **既知の衝突が構造的に消える**: 「main が他 worktree で checkout 中だと `gh pr merge` が失敗する」（[§マージ手順](../../../.claude/rules/workflow.md#マージ方式)の注記）も同根で、指揮台を main に固定すれば発生しない
- **判別コストを消す**: 「生きている作業 = `git worktree list` = open PR 一覧」が常に一致する。混在状態ではこの一致が崩れ、どれが進行中か毎回調べ直すことになっていた

## 却下した選択肢と、なぜ捨てたか

- **混在を条件付きで許容する（並行セッションが無いときだけ main checkout で branch を切る）**: 「いま並行セッションが無いか」の確認が毎回必要になり、確認を省いた瞬間に今回と同じ占有状態に戻る。07-24 で「人間の注意力に頼る形は同じ失敗を繰り返す」と結論した論点の再演になる
- **「1 worktree = 1 branch = 1 PR」の文言を削る**: 掃除の規律としては有効に機能している（完了定義 5 点と `branch:finish` がこの前提に乗っている）。削るのではなく「PR の寿命と運命を共にする使い捨ての机」という言い換えを添えて、PR 粒度との混同を解いた

## 影響・やること

- 改訂: `.claude/rules/workflow.md` §Worktree 運用 に「main checkout の役割（指揮台モデル）」を追加し、原則段落に言い換えを 1 文追加
- `AGENTS.md` は §Worktree 運用 への参照で足りるため変更しない（同じ規約を二重管理しない）
- スクリプト・CI の変更はなし。既存の `finish-branch.sh` の挙動を前提として明文化しただけ

## 保留（ユーザー判断待ち）

- `~/Desktop/dayopt` に乗っている `claude/design-system-worldview-1757` の未コミット差分は進行中作業のため今回触らない。指揮台モデルへの移行（この branch を worktree へ移す or 完了させて main に戻す）はユーザーが別途行う
- 本 PR 自体の merge も、指揮台が main に戻るまで実施しない。`pnpm branch:finish` の `checkout main` が進行中作業を壊しうるため
