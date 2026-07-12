---
status: current
last_verified: 2026-07-12
code: apps/product/src/features/calendar
---

# Calendar（カレンダー）

Plan（予定）と Record（記録）を配置・閲覧するプライマリUI。

## 現在の振る舞い

- Day / Week / MultiDay（Nday）の複数ビューで、各日カラムを **Plan レーンと Record レーン** に分けて表示する。Record レーンが視覚的な主役（塗りのカード）、Plan レーンは控えめ（アウトライン・淡色）
- ブロック作成・編集時に保存先を選ぶ UI はない。**`end_at > now` → Plan、`end_at <= now` → Record** として一意に保存先が決まり、時間編集で now をまたぐとチップの表示が自動で切り替わる
- ドラッグ&ドロップで時間位置を変更できる（過去 Plan の時間は凍結、Record は訂正可）
- 15分グリッドで時刻をスナップする
- クロノタイプに基づく生産性ゾーンを背景色で可視化する
- Palette からのクイック挿入で頻出ブロックを1タップ作成できる

## 関連する意思決定

- [ADR-025 時間管理モデルを Plan / Record / 外部カレンダーミラーの3概念に分割する](../log/2026-07-09-time-model-split.md)
- Timeline Precision Redesign（paused。精度非対称化の検討は Project A/B/C に分割済み、未実装。設計書は git 履歴を参照）
