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

- [ADR-011 統合ブロックモデル](../../decisions/011-unified-block-model.md)
- [Timeline Precision Redesign](../../archive/projects/timeline-precision-redesign/overview.md)（paused。精度非対称化の検討は Project A/B/C に分割済み、未実装）
