---
status: frozen
date: 2026-07-17
code: apps/product/src/features/timeblock/components/editor/TimeblockInspectorForm.tsx
github_issue: 1473
---

# InspectorのUI Issueを現行設計に合わせて整理する

## 原文

> インスペクター側のuiの修正がいくつかissueであったから良しなに対応できる?issueの内容を優先はしなくて大丈夫。不要な場合はクローズ

## 文脈

旧Entryモデルを前提にしたInspector Issueが、Plan / Record分離後も一部残っている。Issue本文をそのまま実装するのではなく、現行仕様とコードを正として必要性を再評価する。

## 対応方針

- 既存Plan / Recordの時刻編集は、同一レーンの重複を保存前に判定する
- 重複時は複製・タグ作成と同じ日時入力直下のエラーを表示し、競合する更新を送らない
- PlanとRecordの相互重複は許可し、編集中の行自身は判定から除外する
- cacheに存在しない競合や同時更新はserver validationを維持し、拒否時も同じインラインエラーへ戻す
- 監査完了後のumbrella Issueは、実装Issueと区別して完了として閉じる
