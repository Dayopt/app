# AGENTS.md

> **全 PR 対象の外部レビューは 2026-08-13 に廃止済み（[#2040](https://github.com/Dayopt/dayopt/issues/2040)、`docs/engineering/log/2026-08-13-internal-review-standardization.md`）。merge gate としての内製クロスレビュー（`.claude/rules/workflow.md` §レビュー指摘の必須解決、`.claude/skills/pr-cross-review/SKILL.md`）はそのまま正本。** 2026-08-20（[#2238](https://github.com/Dayopt/dayopt/issues/2238)）、高リスク PR に限定して Codex を追加レイヤーとして手動・可逆・非ブロッキングで試行再導入した。**どの PR を対象にするかの選別基準は `.claude/rules/orchestration.md` §高リスク PR への限定 Codex レビュー（試行） が正本**。以下は Codex がレビュー時に何を守るか（観点・severity）だけを定義する。severity 定義（P1/P2/P3）の生きた正本は `pr-cross-review` skill 側。

このファイルは OpenAI Codex のクラウドコードレビュー（PR への `@codex review`）専用のレビュー規則。Codex はレビュー専任で、実装は行わない。実装・運用の正本ガイダンスは `CLAUDE.md` と `.claude/rules/` にあり、対象ディレクトリに `AGENTS.md` がある場合はそのスコープ固有のレビュー規則も適用する。

## Code Review Rules

- レビューコメントは日本語で書く。
- diff によって新たに生じる、または現実に悪化する不具合だけを指摘する。問題がなければ指摘ゼロでよい。
- 指摘には優先度と、発生条件を含む現実的な failure scenario を添える。
  - **P1**: 本番でユーザー影響、データ破壊、認可漏れ、または誤課金が起きる。
  - **P2**: 現実的なエッジケースで誤動作し、修正せずに出荷すべきでない。
- 指摘には原因と最小限の安全な修正方針を含める。到達可能な failure scenario を説明できない推測は指摘しない。

**severity 表記の整合注記（2026-08-20 確認、#2238）**: OpenAI 公式ドキュメント（[GitHub 連携](https://learn.chatgpt.com/docs/third-party/github)）によると、Codex のクラウド code review 機能自体は **P0 / P1** の 2 段階でのみ issue にフラグを立てる（P0 が最重大）。これは本ファイルが定義する **P1（Dayopt の最重大） / P2（エッジケース）** の 2 段階とラベルが異なる。Codex のコメントが「P0」「P1」を名乗っても、それは本ファイルの P1（重大）に相当すると読み替える。指揮台がクロスレビュー結果を統合・記録する際は、Codex 由来のラベルをそのまま転記せず、本ファイルの P1/P2 定義（および `pr-cross-review` skill の P1/P2/P3）へ変換してから扱う。

### 重点ルール（高リスク PR 限定再導入時、2026-08-20）

`.claude/rules/orchestration.md` §高リスク PR への限定 Codex レビュー（試行） の基準で選ばれた PR に対して、Codex が優先して確認する不変条件。lint・型検査・静的チェックで機械的に検出できる項目は重複させない。

- **CODEX-1（ユーザー・テナント分離）**: あるユーザーのリクエストが、別ユーザーのデータへ読み書きできる経路を新規に開いていないか。RLS / authorization / service role の境界を越境していないか。
- **CODEX-2（Dayopt の時間不変条件）**: timezone / DST / 日境界、半開区間 `[start, end)`、overlap 判定、Plan / Log の対応関係のいずれかを壊していないか。時間データが失われる、または既存記録の意味が変わる変更でないか。
- **CODEX-3（外部契約の後方互換性）**: MCP / public API / OAuth scope、Stripe / billing / webhook、外部 calendar sync の event / payload / field name を、既存 consumer が壊れる形で変更していないか。

### TEST-1: 変更後の挙動を証明しないテスト

- **適用条件**: 変更した挙動を担保する unit / integration / E2E test を追加・更新した場合。
- **Failure scenario**: 操作前から存在する要素、generic な alert / class、または発火していない mock を確認しただけでtestが成功し、本番では対象操作が失敗しても回帰を検出できない。
- **Safe path**: 対象操作後にだけ生じるユーザー可視の結果または永続状態をassertする。network mockはlogin / render / cache warmより前に登録し、必要ならrequestの発生と最終UIの両方を確認する。
- **例外**: pure functionのunit testなど、入力と直接の返り値だけで契約を完全に証明できる場合。

指摘しないもの:

- スタイル、可読性、命名などの好み
- PR の大きさ
- 「ついで refactor」や将来のためだけの提案
- lint・型検査・静的チェックだけで確定的に検出され、実害を伴う抜け道がない違反
- diff と無関係な既存問題
