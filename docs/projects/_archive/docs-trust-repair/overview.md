---
status: done
last_verified: 2026-07-14
code:
  - docs
  - scripts/docs-guard
---

# docs-trust-repair — 内部ドキュメントの信頼性修復

内部ドキュメントを、開発者と AI が現在の仕様・設計理由・実装場所を判断できる正本へ戻し、その契約を `pnpm docs:check` で維持する。

## Goal

current stock、Storybook、開発入口、Project / log lifecycle の矛盾を解消し、今後の構造的な drift をローカルと CI の両方で検出する。

## Delivery

1. **Content repair** — `docs/README.md` の情報設計を明確化し、current stock、Storybook、README、rules / commands を現行コードへ同期する。
2. **Guard enforcement** — frontmatter、code path、Project lifecycle、新規 log、append-only の契約を `scripts/docs-guard` と unit test で強制する。

## Metadata Contract

- stock: `status: current | superseded`、`last_verified`、任意の `code`
- Project overview: `status: active | paused | done`、`last_verified`、`done` なら `summary.md` 必須
- new log: `status: frozen`、ファイル名と一致する `date`、任意の `code` / `superseded_by`
- 既存 log は移行しない。Git 上で新規追加される log から新契約を適用する

## Acceptance Criteria

- current stock と Storybook に削除済み feature や旧データモデルを現行機能として説明する記述がない
- Review panel の所有権、Plan / Record、feature DAG、env / secrets の説明が現行コードと一致する
- `latest.md` を使わず、日付付き log だけで履歴を保持する
- `pnpm docs:check` が working tree の staged / unstaged / untracked を含めて新契約を検証する
- `pnpm test:scripts` と `pnpm check` が通る

## Reversibility

すべて repo 内の文書・スクリプト・テスト変更であり、DB、公開 API、外部設定、ユーザーデータは変更しない。各変更は commit revert で数分以内に戻せる。

## Out of Scope

- `apps/web/content/docs` と release note の改稿
- Anthropic、Chronotype、`fulfillment_score`、Slack webhook 等の runtime cleanup
- 既存 legacy log の一括 frontmatter 変換
- Calendar / Review の UI・route・feature ownership の変更
