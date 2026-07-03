# docs 再編 — 移行計画（実行記録）

実行日: 2026-07-02
関連: [2026-07-02-docs-restructure](./2026-07-02-docs-restructure.md)

このファイルは docs 再編を Claude Code に実行させた際の移行計画そのものを記録として保存したもの。実行原則・Phase 0〜4 の内容は下記の通り。実際の実行結果・差異は各 Phase のコミットログを参照。

---

## 実行原則

- 移動は必ず `git mv` で行い、履歴を保持する。Phaseごとにコミットを分ける
- 大文字小文字のみの変更（例: `Billing.md` → `billing.md`）は、大文字小文字を区別しないFSでは2段階で行う: `git mv Billing.md _billing.md && git mv _billing.md billing.md`
- 【中身確認】の付いた項目は、ファイルの中身を読んでから移行先を最終判断する
- 移動が終わったら Phase 3（リンク修正）を絶対に飛ばさない

## Phase 0: 準備

- ブランチを切る: `docs-restructure`
- リポジトリ直下に `AGENTS.md` を配置。`CLAUDE.md` は中身を `@AGENTS.md` の1行にする
- `docs/guides/developer-map.md` を新しい `docs/README.md`（地図）に統合し、`developer-map.md` は `docs/archive/` へ
- ディレクトリ作成: `architecture/{api,frontend,data,platform,conventions}`、`operations/monitoring`、`business/{brand,marketing,sns}`、`notes`、`archive/projects`

## Phase 1: 単純移動（判断不要、`git mv` 一括）

`architecture/` の再配置（api/frontend/data/platform/conventions サブディレクトリ化）、`quality/` の解体（`architecture/platform`・`operations/monitoring` へ）、`guides/` ⇄ `operations/` の整理、`business/` + `strategy/` の統合（PascalCase → kebab-case、brand/marketing/sns への集約）。

現状維持（移動しない）: `decisions/`（001〜010）、`glossary/`、`journal/`、`sessions/`、`operations/releases/`、`operations/security/`、`projects/README.md`。`sessions/latest.md` は上書き可の例外としてそのまま。

## Phase 2: 統合・要判断（中身を読んでから実行）

- 時点もの（監査・レビュー）を `notes/` へ。初出日を `git log --follow --diff-filter=A` で取得し日付プレフィックスを付与
- 競合ドキュメントの統合（`business/CompetitorMatrix.md` + `strategy/competitors.md` → `business/competitors.md`）
- 用語集の統合（`architecture/domain-glossary.md` → `glossary/terms.md`、`architecture/storybook-glossary.md` → `glossary/storybook.md`）
- ADR の合流（`architecture/adr/` を `decisions/` へ日付順に連番振り直し）
- `openapi.json` の行き先判断（生成物と判明したためdocsから撤去）
- `strategy/research/` の振り分け（時点ものは `notes/`）
- `projects/` 12件のトリアージ（`status: active | paused | done` frontmatter付与、完了・停止分は `archive/projects/` へ）
- `secrets.md` の監査（実秘密値の混入チェック）
- この再編自体の記録（本ファイル + [ADR-024](./2026-07-02-docs-restructure.md)）

## Phase 3: メタデータ付与とリンク修正（飛ばし厳禁）

- frontmatter の一括付与（`status` / `last_verified`）
- 旧パス参照の全修正（docs内リンクだけでなく、コード内コメント、Storybook mdx、CI設定、`.claude/` や skills の設定も対象）
- リンク切れチェック
- 空ディレクトリの削除（`api/`、`quality/`、`strategy/`、`architecture/adr/`）

## Phase 4: 検証チェックリスト

- [ ] 旧パスの grep がリポジトリ全体でゼロ件
- [ ] docs内の相対リンクがすべて解決する
- [ ] `docs/README.md` の地図と実ディレクトリ構成が一致している
- [ ] `decisions/` の連番に重複・欠番がない
- [ ] `secrets.md` に実値が含まれていない
- [ ] Storybook 側から docs へのリンク（あれば）が生きている
- [ ] `AGENTS.md` / `CLAUDE.md` がリポジトリ直下にあり、Claude Code と Codex の両方が読める
- [ ] `projects/` に残っているのは `status: active` のみ

## 実行時の差異・フォローアップ

- `.claude/rules/*.md` の直接編集は auto mode のセルフモディフィケーション防止でブロックされたため、CLAUDE.md固有情報の統合は `AGENTS.md` 側で吸収した
- `docs/operations/secrets.md` はサンドボックス権限で Read/Bash とも拒否されたため、監査は本 restructure 実行時には完了できなかった。別セッションでの実施が必要
- `projects/` は厳密な `active | paused | done` の3値判定に加え、完了かつ学びが `summary.md` に抽出済みのもの（sidebar系4件 + `cleanup-2026-04-26`）のみを `archive/projects/` へ移動する運用とした（`mcp-server` 等、summaryはあるが直近参照頻度が高いものは `projects/` に残置）
