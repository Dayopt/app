---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/entry/server/router-index.ts
  - apps/product/src/app/api/v1/calendar
  - apps/product/src/app/api/mcp/_tools/entries-list.ts
---

# Step 8: カットオーバー（plans / logs への切り替え）

runtime の正を entries から plans / logs に切り替える。Step 2-7 の dormant 実装が揃っていることが前提。このステップの PR は**配線とデータ再同期に限定**し、新機能は足さない。

## Goal

書き込み・表示・統計・外部公開面のすべてが plans / logs を読む状態にし、entries への新規書き込みを止める。

## 決めること（overview §8 未決 5・7）

- **未決 5 — iCal export の対象（推奨: plans のみ）**: 外部カレンダー購読の用途は「Dayopt の予定を Google 等に出す」なので plans を出す。logs のフィードが欲しくなったら別トークン・別パスで追加できる（既存 URL の意味を変えないので非破壊）。既存購読者にとっては「entries の予定レイヤー」→「plans」で実質同じ内容
- **未決 7 — MCP contract（推奨: 追加 + 当面併存）**: `plans-list` / `logs-list` tools を追加し、既存 `entries-list` は plans + logs から旧 shape を合成して当面維持する（MCP クライアント設定はユーザー環境にあり、即時破壊を避ける）。deprecation は docs に明記し、削除は Step 9 以降の別判断

## Minimum Viable Approach

1. **切り替え順序**（1 リリース内）:
   1. Step 2 の backfill migration を再実行して delta を吸収（デプロイ直前）
   2. デプロイ: UI（Calendar / Inspector / Review）を Step 5-7 の新実装へ接続、統計 router 内部を Step 4 の service へ差し替え、entries router の mutation を閉じる（read は Step 9 まで残す）
   3. デプロイ直後にもう一度 backfill を再実行し、migration〜デプロイ間の書き込みギャップを吸収（冪等なので安全）
2. iCal export（`app/api/v1/calendar/[token]/route.ts`）を未決 5 の決定に従って plans 読みへ切り替え
3. MCP: `plans-list` / `logs-list` 追加、`entries-list` は合成互換
4. 旧 UI（単一レーン + compare rail）へのルーティングを新 UI に差し替える。旧コードは残置（削除は Step 9）
5. **デプロイ後監視**: Sentry でエラー増加、Vercel runtime logs、EXCLUDE 違反（TIME_OVERLAP）の頻度を能動的に確認（mcp-usage ルール）。Playwright スクリーンショットで Calendar / Review の視覚確認まで完了条件に含める

## Scope

やる: 配線切り替え、backfill 再実行、iCal / MCP の切り替え、監視。
やらない: entries / RPC の drop（Step 9）、新機能、Phase 2 要素。

## Reversibility Table

| Step                           | Tag            | 備考                                                                                                                                                                                                    |
| ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI / 統計 / router の配線      | [minutes]      | デプロイ直後なら revert 一発。**ただし新テーブルへ書き込みが入った後は entries 側が stale になり、巻き戻しにデータ修復判断が要る（[days] に劣化）**。切り替え後 24-48h は revert 判断を最優先で監視する |
| iCal export 切り替え           | [irreversible] | 外部購読者が見る URL の内容契約。未決 5 を確定してから実施                                                                                                                                              |
| MCP tools 追加（合成互換込み） | [minutes]      | 追加のみ。entries-list の挙動は維持                                                                                                                                                                     |

## Existing Code to Reuse

- `apps/product/src/features/entry/lib/entry-to-ical.ts` — plans 読みへの改修ベース
- `apps/product/src/app/api/mcp/_tools/entries-list.ts` — tool 定義・auth の踏襲元
- Step 2 の backfill migration（再実行）と検証クエリ

## What I'm Not Doing

- feature flag による段階公開はしない。dormant 実装 + 1 リリース切り替え + 冪等 backfill の方が、フラグ分岐の二重実装より安全域が広い
- entries の read 経路の削除はしない（Step 9 で呼び出しゼロを確認してから）

## Follow-up

切り替え後 1 週間程度、Sentry / 統計数値の異常がないことを確認してから Step 9（後始末）に進む。
