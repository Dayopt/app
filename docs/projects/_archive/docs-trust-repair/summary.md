---
status: current
last_verified: 2026-07-14
code:
  - docs
  - scripts/docs-guard
---

# docs-trust-repair 完了サマリー

内部 docs を、開発者と AI が現在の仕様・判断履歴・実装場所を区別して辿れる構造へ整理し、その境界を `pnpm docs:check` で検査できるようにした。

## 完了した契約

- `docs/README.md` を情報設計の正本とし、stock / Project / log、Storybook、app README、公開 docs、code の責務を分離した
- current stock を Plan / Record、Calendar 所有の表示範囲、Review 所有の panel UI、現在の feature DAG・infra・runtime SaaS に同期した
- component の variant / state / interaction は Storybook に残し、横断仕様と data flow は root docs へ集約した
- Project は `active | paused | done`、完了時は `summary.md` 必須とし、log は新規作成時から `frozen` と filename に一致する `date` を要求する
- `latest.md` を廃止し、日付付き log と Git 履歴だけを履歴の正本にした
- docs guard は base ref から working tree までの committed / staged / unstaged / untracked を検査し、既存 log の変更・削除・rename を拒否する
- 既存 legacy log は一括変換せず、リンク切れを warning として可視化しながら新規 log から厳格な契約を適用する

## 検証

- `pnpm docs:check`
- `pnpm test:scripts`
- `pnpm storybook:taxonomy`
- `pnpm build-storybook`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm lint:boundaries`
- `pnpm check`

詳細な目的、metadata contract、対象外は [overview](./overview.md) を参照する。
