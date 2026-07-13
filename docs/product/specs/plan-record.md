---
status: current
last_verified: 2026-07-13
code: apps/product/src/features/timeblock
---

# Plan / Record（予定 / 記録）

Dayoptの中心概念。「予定を立てる → 記録する → 差分を見る」のループを、Plan（予定）と Record（記録）の2エンティティで表現する。旧 Entry 単一モデル（計画・実績を1行で持つ）は ADR-025 で廃止した。

## 2エンティティ構成

- **Plan（予定）**: これからやる時間の宣言。`plans` テーブル
- **Record（記録）**: 実際に使った時間。物理 `records` テーブル
- **1 Plan : N Record**。`records.plan_id` があれば「予定に対する記録」、なければ「予定外の記録」
- 1つの予定に複数回の記録を紐づけられる（例: 途中で中断して後で再開した場合など）

## 保存先ルール（選択 UI なし）

- **`end_at > now` → Plan、`end_at <= now` → Record**。「未来の記録は作れない」「過去の予定は無意味」の帰結として、時間編集の結果だけで保存先が一意に決まる
- フォームの「予定として保存 / 記録として保存」表示はセレクタではなく**状態表示**。時間編集で now をまたいだ瞬間に自動で切り替わる
- エディタは Plan / Record で共有し、destination の表示だけが差し替わる

## skip（やらなかった）と未記録の区別

- 過去の Plan は記録されるまで「未記録の予定」。自動で実績にはならない（明示記録が原則）
- `skipped_at`（やらなかった）と未記録（まだ記録していない）は別状態。Review では「未記録の予定」「やらなかった予定」として区別して出す
- 「軽く回す」ための緩和導線は下記3つ

## 記録導線（3つ）

- **ワンタップ「そのまま記録」** — Plan の時間帯をそのままコピーした Record を1タップで作成
- **Record レーンへのドラッグ** — Plan カードを Record レーンへドラッグ（リサイズすればずれ込みで記録できる）
- **一括「この日を確定」** — その日の未記録 Plan をまとめて `confirm_day_plans_to_records` で Record 化

## DB rename の移行状態

物理 DB と正本 RPC は Record に統一済み。旧 deploy のための `logs` security-invoker view と旧名 RPC alias は一時的に残し、安定確認後の #1580 で削除する。

## 過去 Plan の時間凍結

| 過去 Plan への操作               | 可否                                      |
| -------------------------------- | ----------------------------------------- |
| 予定時間の変更（移動・リサイズ） | ✗（時間は凍結。差分データの信頼性を守る） |
| タイトル・タグ・メモの訂正       | ○（時間フィールド以外は訂正可）           |
| 過去日付への新規 Plan 追加       | ✗（実際にやったことは予定外の Record へ） |
| ワンタップ記録 / skip / 削除     | ○                                         |

end が未来の Plan（進行中含む）は自由に編集できる。ただし end を過去へ縮める操作は不可（早く終わったなら短い Record で記録する）。Record 側は過去の記録なので通常の訂正（時間・タグ・note・fulfillment_score）が可能。

## 重なり制約

- Plan 同士・Record 同士: EXCLUDE 制約で禁止（半開区間 `[)`、per-user、`deleted_at IS NULL` のみ対象）
- Plan × Record: 許可（予定と記録は別レイヤーなので重なってよい）
- 緩和は実質不可逆（一度重なりデータが入ると再強化にデータ犠牲が伴う）

## fulfillment_score

達成度スコア（1-3）は Record 側の属性。Plan には存在しない（予定の時点では達成度を測れないため）。

## 関連する意思決定

- [ADR-025 時間管理モデルを Plan / Record / 外部カレンダーミラーの3概念に分割する](../log/2026-07-09-time-model-split.md)
- [ADR-015 時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [ADR-018 時間重なりの全面禁止](../log/2026-05-13-time-overlap-prohibition.md)
- [ADR-020 entries の論理削除](../../engineering/log/2026-03-18-soft-delete-model.md)
- [機能スコープ: やらないことを決める](../log/2026-06-16-feature-non-adoption.md)（繰り返し予定を採用しない理由）
