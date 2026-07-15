---
status: frozen
date: 2026-07-15
code: apps/product/src/features/calendar/components/ShortcutCheatSheetDialog.tsx
---

# ショートカット一覧の説明文を削除する

タイトル直下の説明文は情報量を増やさないため、表示しないという要望。

---

## 原文

> カレンダーの操作中に利用できます。
> いらない

## 文脈

- ショートカット一覧のタイトル下に、利用場面を説明する一文を表示していた

## 解釈

- タイトルだけで目的が明確なため、補足説明は不要

## 対応

- Dialogから説明文を削除する
- 日英両方の未使用翻訳キーを削除する
