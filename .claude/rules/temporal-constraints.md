---
paths:
  - 'apps/product/src/features/timeblock/**'
  - 'apps/product/src/features/calendar/**'
---

# Temporal Constraints（時間制約）

過去は変えられない。記録（Record）はユーザーが明示的に作る。

## ブロックの状態

| 状態         | 判定条件                   |
| ------------ | -------------------------- |
| **upcoming** | `start_at > now`           |
| **active**   | `start_at <= now < end_at` |
| **past**     | `end_at <= now`            |

判定: `getTimeblockState()` (`apps/product/src/features/timeblock/lib/timeblock-status.ts`)

## 操作制約（Plan / Record 分離モデル）

### 過去 Plan — 禁止

- ドラッグ移動、リサイズ、予定時間編集、過去日付への新規 Plan 追加

### 過去 Plan — 許可

- タイトル・タグ・メモの訂正、ワンタップ記録、skip、削除

### 未来/進行中 Plan

- 全操作可能。ただし end を過去へ縮める操作は不可（早く終わったなら短い Record で記録する）

### Record

- 過去の事実の記録なので時間編集可。ただし end が未来になる編集は不可（保存先ルール: `end_at <= now` が Record の条件）

## 防御レイヤー

各制約は UI（disabled/非表示） + ロジック（早期return）の二重防御。
