---
status: frozen
date: 2026-07-16
code:
  - packages/components/src/overlays/dialog.tsx
  - packages/components/src/overlays/drawer.tsx
  - packages/components/src/overlays/sheet.tsx
---

# モバイルbottom sheetの閉じ方とoverlayの意図を統一したい

## 原文

> ok.ボトムシートについてちょっと考えたいのが、モバイルではかなり利用するからつかい勝手を良くしたいんだよね。なんか今イマイチだなって気がしてる。あと細かいけど、キャンセルって言葉を使って閉じたり✗で閉じたり、ボタンが無かったりするのでこれは統一が必要なのか、しなくていいのか。また、背景がオーバーレイしてるやつとしてないやつとかもあって、このあたりのいともはっきりさせたほうがいいかなと

## 現時点の論点

- mobileで利用頻度の高いbottom sheetを、個別実装ではなく用途別の共通patternとして整理する
- 「キャンセル」「閉じるicon」「明示ボタンなし」は、見た目ではなく破棄される一時状態の有無で使い分ける
- 背景overlayは実装primitiveではなく、背景操作を止めるmodalか、文脈を見ながら使うnon-modalかで決める
- 既存利用箇所を棚卸ししたうえで、共通componentと移行順を別途決定する
