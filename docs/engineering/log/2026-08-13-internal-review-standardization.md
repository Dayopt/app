---
status: frozen
date: 2026-08-13
---

# 外部レビュー（Codex）を廃止し、内製クロスレビューを merge gate の正式な標準にする

## 背景・当時の前提

- Codex は `chatgpt-codex-connector[bot]` によるクラウド PR レビュー専任として運用していた（[2026-08-05-codex-review-only.md](2026-08-05-codex-review-only.md)）。usage limit や障害で応答しない期間が繰り返し発生し（#1850 以降 8 PR 連続で無応答になった実測がある）、`branch:finish` の外部レビュー痕跡 gate に `[no-external-review]` escape hatch を設ける対処をしていた
- 2026-08-13、Codex が終日応答不能な状態で、内製 2 層レビュー（レーンの push 前反証 + 指揮台の merge 前クロスレビュー: `risk-reviewer` / `behavior-verifier` を最終 diff に並列実行）だけで運用した結果、medium 級の実欠陥を多数捕捉した（fence 素通り Server Action 2 本、未認証増幅経路、復元シナリオの fence 無効化、MFA step-up 詰み画面ほか）。同日、Codex ゼロで PR 4 本を出荷し、medium 級 7 件以上を merge 前に捕捉、うち 1 件は主機能の実動作不良を実測で検出した
- User と指揮台が同日、[#2040](https://github.com/Dayopt/dayopt/issues/2040) で設計合意した: 内製 3 層レビュー（plan-review / push 前反証 / merge 前クロスレビュー）を正式な標準とし、外部レビューは補完としても残さず廃止する（課金節約が主目的。Gemini 等の安価な代替は別 issue で将来検討）

## 決定と理由

**外部レビュー（Codex）を廃止し、`branch:finish` の merge gate と関連 rules を内製クロスレビューベースへ全面移行する。**

1. `.claude/skills/pr-cross-review/SKILL.md` を新設し、指揮台がレーンから merge 可能報告を受けた後に発火する。`risk-reviewer` / `behavior-verifier`（該当時 `architecture-guard`）を並列実行し、P1/P2/P3 に分類する
2. `scripts/git/finish-branch.sh` の外部レビュー痕跡 gate を `[internal-review]` marker ベースへ差し替える。判定は 5 点（marker 先頭一致 / OWNER・MEMBER・COLLABORATOR / 本文非空 / `head: <sha>` が merge に使う HEAD SHA と一致 / `agent: <値>` が非空）。旧設計の `EXTERNAL_REVIEWER_LOGIN` / `NO_EXTERNAL_REVIEW_MARKER` / allowlist 判定はすべて撤去する
3. **二層構造にする**: P1/P2 の実質的な指摘は inline review comment として投稿し、既存の thread-resolve gate（変更なし）で resolve を強制する。`[internal-review]` marker 自体は「実施したという証跡」だけを担う。旧設計は marker 1 経路に指摘の有無まで詰め込んでいたため、内製レビューへそのまま移すと thread gate が内製指摘に一切効かなくなる問題があり、二層化で解消した
4. `head:` 行による SHA 拘束を新設する。旧設計にはこの拘束が無く、早期に貼った証跡を使い回して以後の未レビュー push を素通りさせる余地があった。SHA 拘束により、監査性（どの commit がレビューされたか）は旧設計より強化された
5. `.claude/rules/orchestration.md` §指揮台の merge シーケンス を改訂し、ready 化・重量 CI watch の実行をレーンへ移管する（[#2042](https://github.com/Dayopt/dayopt/issues/2042)）。ready 化の前提条件（確定伝達済み・merge 順で先頭・追従済み・直前 push の軽量 CI 起動完了）はレーンの自己判定にせず、指揮台の確定伝達メッセージが宣言する
6. `.claude/rules/workflow.md` §PR 粒度 に「判定 3 問」を追加する（[#2034](https://github.com/Dayopt/dayopt/issues/2034)）。同時に束ねた運用ルール変更で、内容は独立: PR 束ねの適否を境界（同じレーンが書いたか / 壊れたら一緒に戻すか / クロスレビュー 1 巡で読み切れるか）で判定する
7. `AGENTS.md` は削除せず、冒頭に凍結注記を追加する（レビュー規則本文は再開時のために保持）。severity（P1/P2/P3）定義の生きた正本は `pr-cross-review` skill 側に移す

**重要な留保: 独立性は後退している。** 旧設計は「別主体（Codex）の応答」という偽造しにくい証拠に依っていたが、新設計は同一 agent 系列（Claude）の自己申告に依る（OWNER/MEMBER/COLLABORATOR しか投稿できないことが唯一の担保）。SHA 拘束による監査性の強化はこの独立性の後退を完全には相殺しない。**戻す条件**: 内製クロスレビューが本番影響のある実バグを 2 件連続で見逃した場合、独立した外部レビュー（Codex またはその代替）の再導入を検討する。

## 却下した選択肢と、なぜ捨てたか

- **Codex を補完として残す（usage limit がある時だけ内製で代替）** — User の明示決定で却下。二重運用は課金と維持コストの両方を払い続けることになり、2026-08-13 の実測で内製単独でも十分機能することが示された
- **`[internal-review]` とは別に「レビュー未実施」用の escape hatch marker を新設する** — 旧 `[no-external-review]` と同じ発想だが、`[internal-review]` 1 marker の本文を「実施結果」または「対象外 diff + 一次情報照合」のどちらでも書けるようにすれば、2 marker を運用で使い分けるコストが要らない
- **P1/P2 も `[internal-review]` の summary comment 1 件にまとめる** — 単純だが、issue comment は GraphQL の `reviewThreads` を生成しないため、既存の thread-resolve gate（指摘の黙殺防止）が内製指摘に一切効かなくなる。review comment 化して二層構造にする方を採った
- **`agent:` 値（docs-only 等）を変更ファイル一覧と突き合わせて機械検証する** — 実装コストに見合う便益が薄いため見送り、attestation（自己申告）であることを明記するに留めた。将来 severity 誤申告が問題になれば機械検証を追加する

## 影響・やること

- **本 PR 自身は旧版 gate（`[no-external-review]`）で判定される。** 新 gate は main へ merge された後にしか有効化されない
- **残存する Codex 言及の棚卸し**: 実際に誤った現在形の主張になっていたもの（`CLAUDE.md` / `AGENTS.md` 冒頭 / `.claude/skills/audit-ai-config/SKILL.md` / `docs/engineering/invariants.md` / `README.md` / `.husky/pre-push` / `docs/operations/security.md` の per-PR control 表）は本 PR で修正した。以下は意図的に据え置き、follow-up [#2046](https://github.com/Dayopt/dayopt/issues/2046) でまとめて扱う:
  - `docs/operations/secrets.md`（Codex のローカルファイル非アクセスという境界記述は現在も真）
  - `docs/company/accounts.md`（Codex 課金の解除は User 手作業と #2040 で合意済み。account ledger の更新は User 領域）
  - `docs/engineering/infra.md`（大きめの doc。§出口コスト台帳 等、複数箇所に及ぶ）
  - `.claude/skills/security/SKILL.md`
  - アプリケーションコード中の `Codex round N 指摘` 等の履歴的な attribution コメント（史実であり、書き換える理由がない）
- 内製クロスレビューの捕捉実績（P1-P3 件数と的中）は 2 週間後を目安に振り返り、独立レビュー再導入の要否を再判定する（#2040 に記録）
- 全変更は git revert で復元可能。旧設計の意図は [2026-08-05-codex-review-only.md](2026-08-05-codex-review-only.md) と本ログから辿れる
