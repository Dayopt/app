# AGENTS.md

> **凍結（2026-08-13）**: この外部レビュー運用は停止中。レビューは内製クロスレビュー（`.claude/rules/workflow.md` §レビュー指摘の必須解決、`.claude/skills/pr-cross-review/SKILL.md`）が担う。severity 定義（P1/P2/P3）の生きた正本も `pr-cross-review` skill 側に移した。以下は将来 Codex レビューを再開する場合のために残す。再開判断は実測の振り返り（[#2040](https://github.com/Dayopt/dayopt/issues/2040)）を経て行う。詳細は `docs/engineering/log/2026-08-13-internal-review-standardization.md`。

このファイルは OpenAI Codex のクラウドコードレビュー（PR への `@codex review`）専用のレビュー規則。Codex はレビュー専任で、実装は行わない。実装・運用の正本ガイダンスは `CLAUDE.md` と `.claude/rules/` にあり、対象ディレクトリに `AGENTS.md` がある場合はそのスコープ固有のレビュー規則も適用する。

## Code Review Rules

- レビューコメントは日本語で書く。
- diff によって新たに生じる、または現実に悪化する不具合だけを指摘する。問題がなければ指摘ゼロでよい。
- 指摘には優先度と、発生条件を含む現実的な failure scenario を添える。
  - **P1**: 本番でユーザー影響、データ破壊、認可漏れ、または誤課金が起きる。
  - **P2**: 現実的なエッジケースで誤動作し、修正せずに出荷すべきでない。
- 指摘には原因と最小限の安全な修正方針を含める。到達可能な failure scenario を説明できない推測は指摘しない。

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
