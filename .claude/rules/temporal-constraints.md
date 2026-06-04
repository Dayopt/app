---
paths:
  - 'apps/product/src/features/entry/**'
  - 'apps/product/src/features/calendar/**'
---

# Temporal Constraints（時間制約）

過去は変えられない。記録だけ正しく残す。

## ブロックの状態

| 状態         | 判定条件                       |
| ------------ | ------------------------------ |
| **upcoming** | `start_time > now`             |
| **active**   | `start_time <= now < end_time` |
| **past**     | `end_time <= now`              |

判定: `getEntryState()` (`apps/product/src/features/entry/lib/entry-status.ts`)

## 操作制約

### 過去ブロック — 禁止

- ドラッグ移動、リサイズ、予定時間編集、日付変更

### 過去ブロック — 許可

- 記録時間（actual start/end）、充実度スコア、メモ、タグ、削除

### 未来/進行中ブロック

- 全操作可能。ただし未来→過去へのドラッグ移動は拒否

### 日付移動

- 未来ブロック → 過去の日付は `minDate` でブロック

## 防御レイヤー

各制約は UI（disabled/非表示） + ロジック（早期return）の二重防御。
