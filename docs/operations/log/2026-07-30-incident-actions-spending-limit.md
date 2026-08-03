---
status: frozen
date: 2026-07-30
last_verified: 2026-07-30
issue: 1754
code:
  - .github/workflows/integration.yml
  - scripts/git/finish-branch.sh
---

# GitHub Actions の課金上限で全 CI が起動できなくなった

2026-07-30、MCP 段階導入 Candidate 6 の PR #1781 を作成した直後から、GitHub Actions の全 workflow が起動しなくなった。同日の Candidate 5（PR #1780）は 13 check すべて pass しており、その直後の PR で発生した。

## 起きた事実

- PR #1781 の Actions 系 8 check がすべて failure になった。Vercel 系 4 check（`Vercel – product` / `Vercel – web` / `Vercel Preview Comments`）と `Supabase Preview` は pass した。
- 失敗した 4 つの run（`30509393429` / `30509393443` / `30509393477` / `30509393420`）はいずれも **`started_at` から `completed_at` まで 3 秒、`steps` 配列が空**だった。1 step も実行されていない。
- check run の annotation に原因が出ていた。

  ```
  The job was not started because recent account payments have failed or your
  spending limit needs to be increased. Please check the 'Billing & plans'
  section in your settings
  ```

- `gh run view --log-failed` は `log not found` を返す。ログが存在しないため、job 単位の失敗ステップからは原因を特定できない。
- 直前に走った Candidate 5（PR #1780）の run は 2 回とも完走し 13 check pass だった。上限に到達したのは PR #1781 の run 起動時点。

## 影響範囲

- Candidate 6 の実装・ローカル検証・独立レビューは完了していたが、CI が起動しないため merge gate を満たせなくなった。`scripts/git/finish-branch.sh` は failure を数えるので `pnpm branch:finish` も通らない。
- PR を開いたまま待つと、Supabase GitHub integration が PR ごとに作る一時 Preview Branch（`tswqilwrmneqztxctuxv`）が稼働し続けて課金される。**検証できない状態で費用だけが増える**構造になっていた。
- 顧客影響なし。Production の deployment、migration、gate 状態はいずれも変更していない。Candidate 5 の Production 適用は上限到達前に完了している。

## 対応

1. コードの問題でないことを確定させた（annotation の取得、steps 0 件の確認、Vercel 系 check の pass）。
2. PR #1781 を**一時クローズ**した。これにより Supabase の一時 Preview Branch が自動削除され、課金対象は `main` のみになった。
3. branch `claude/mcp-timeblock-acl-cutover-1754` は origin に残し、ローカルとリモートを `1bb43be29` で一致させた。未コミット差分ゼロ。
4. 再開手順を PR #1781 のコメントと Issue #1754 のコメントへ記録した。

## 学び

- **ジョブが起動しない失敗は、通常の CI 失敗と見分ける手順が違う。** `--log-failed` は空を返し、job の `steps` も空になるため、失敗ステップを探しても何も出ない。原因は check run の annotation にしか出ない。

  ```bash
  gh api repos/Dayopt/dayopt/check-runs/<check_run_id>/annotations --jq '.[] | {message, annotation_level}'
  ```

  「全 workflow が同時に短時間で失敗し、steps が空」というパターンを見たら、コードを疑う前に annotation を読む。

- **CI が止まっている間に PR を開いたままにすると、Supabase の一時 Preview Branch が課金され続ける。** Preview Branch は PR に紐づいて作られ、PR の close / merge で自動削除される。CI 復旧まで数日かかる場合は、PR をクローズして branch と PR 本文を残すほうが安い。Reopen すれば同じ branch・同じ本文で Preview Branch も再作成される。

- **ラベルによる guard 回避は次の push でしか効かない。** `ai-review:contract-reviewed` は `labeled` イベントで発火しない設計（`.github/workflows/ai-review.yml` のコメントに理由あり）なので、CI 復旧後は「ラベル再付与 → push」の順で行う。re-run では guard が再び fail する。

- Actions のコストは PR 本数にほぼ比例する（`.claude/rules/workflow.md` §PR 粒度 の 2026-07-25 実測: CI 1 run = 18 課金分、PR 1 本 ≈ 44 課金分）。上限に近づいている状況では、PR を束ねる判断がコスト面でも効く。

## 関連

- GitHub Issue #1754
- PR #1781（一時クローズ。再開手順をコメントに記録）
- [PR 粒度と Actions コスト](../../engineering/log/2026-07-26-pr-granularity-actions-cost.md)
