---
status: current
last_verified: 2026-07-30
code:
  - apps/product/src/features/timeblock/server/timeblock-search-query.ts
  - apps/product/src/features/calendar/components/search
---

# block-search 完了サマリー

過去の Plan / Record を探して開くための、低頻度前提の小さな検索入口を追加した。Calendar を主役から降ろさない範囲に収めている。

## 完了した契約

- `timeblock-search-query.ts` が有効なタグ名とメモを全期間から検索する。新しい順、最大 20 件、soft delete とユーザー単位のスコープを尊重し、skip した Plan も含める
- 永続しないレスポンシブな dialog を Sidebar・モバイルのミニカレンダーヘッダー・`Cmd/Ctrl+K`（`useTimeblockSearchShortcut`）から開く
- モバイルは検索フィールドと Cancel を固定した全高ボトムシートに統一した（`docs/product/log/2026-07-16-feedback-mobile-block-search-sheet.md` の反映）
- 結果を選ぶと対象日へ移動し、元ブロックの Inspector を開く。結果内に副次アクションは置かない
- 検索語は `lib/trpc/logger-policy.ts` でログ・監視経路から除外する

## 実装

- service: `ccc26498a` / 検索対象をタグとメモへ: `4118ac31c` / 入口の配線: `e703e019c` / モバイルシート: `3c8557542` / 検索語除外: `7c7cf9add`

## 受入条件との差分

overview は E2E での確認を挙げていたが、**repo 全体に E2E harness が無い**ため実施していない。検証は unit test と Storybook で行った。E2E を入れる判断は本 project の範囲外。

詳細な設計と決定の経緯は [overview](./overview.md) を参照する。
