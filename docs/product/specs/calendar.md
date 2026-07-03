---
status: current
last_verified: 2026-07-02
code: apps/product/src/features/calendar
---

# Calendar（カレンダー）

エントリ（時間ブロック）を配置・閲覧するプライマリUI。

## 現在の振る舞い

- Day / Week / MultiDay（Nday）の複数ビューで時間ブロックを表示する
- ドラッグ&ドロップでエントリの時間位置を変更できる（`past` なエントリは不可）
- 15分グリッドで時刻をスナップする
- クロノタイプに基づく生産性ゾーンを背景色で可視化する
- Palette からのクイック挿入で頻出ブロックを1タップ作成できる

## 関連する意思決定

- [ADR-011 統合ブロックモデル](../../engineering/log/2026-03-05-unified-block-model.md)
- Timeline Precision Redesign（paused。精度非対称化の検討は Project A/B/C に分割済み、未実装。設計書は git 履歴を参照）
