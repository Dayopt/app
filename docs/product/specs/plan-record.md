---
status: current
last_verified: 2026-07-14
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
- 詳細 Inspector では保存先の選択・状態チップを表示せず、開いた Plan / Record の種別を維持する
- エディタは Plan / Record で共有し、日時とメモを編集する

## 詳細 Inspector の保存

- 保存ボタンは表示しない
- タグは選択の確定時、日時は有効な日付・開始・終了が確定した時に自動保存する
- メモは入力停止から600ms後に自動保存し、フォーカス解除または Inspector を閉じる時は待機中の内容を即時保存する
- 更新は直列に実行し、保存待ちの変更は最新値へまとめる。自動保存中も入力を無効化しない

## Calendar カードの表示名

- Plan / Record カードの表示名はタグ名を source of truth とする
- DB 互換の `title` はカード表示へフォールバックしない。タグがない、またはタグを解決できない場合は「タグなし」と表示する
- タグ名とタグ色は同じタグマスタから解決し、タグ名の変更をカード表示へ反映する
- 詳細 Inspector は `title` 入力を表示せず、タグを表示名として編集する

## skip（やらなかった）と未記録の区別

- 過去の Plan は記録されるまで「未記録の予定」。自動で実績にはならない（明示記録が原則）
- `skipped_at`（やらなかった）と未記録（まだ記録していない）は別状態。Review では「未記録の予定」「やらなかった予定」として区別して出す
- 「軽く回す」ための緩和導線は下記3つ

## 記録導線（3つ）

- **ワンタップ「そのまま記録」** — Plan の時間帯をそのままコピーした Record を1タップで作成
- **Record レーンへのドラッグ** — Plan カードを Record レーンへドラッグ（リサイズすればずれ込みで記録できる）
- **一括「この日を確定」** — その日の未記録 Plan をまとめて `confirm_day_plans_to_records` で Record 化

## コピー / 貼り付け

- 詳細 Inspector とカードの右クリックにある共通の `…` メニューからコピーできる。選択中は `Cmd/Ctrl+C` でも同じコピー状態を作る
- コピー対象は Plan / Record の種別、タグ、メモ、開始時刻、長さ。元の `id` と `plan_id` は引き継がず、貼り付け先には独立した新規行を作る
- `Cmd/Ctrl+V` はコピー元の種別を維持する。Plan は未来、Record は過去にだけ貼り付けられ、条件外では種別を暗黙変換せずエラーを表示する
- Plan と Record の関連を作るのは「そのまま記録」などの記録導線だけ。通常のコピーでは関連を作らない

## DB 契約

物理 DB、正本 RPC、生成型は Record に統一済み。テーブルは `records`、一括確定は `confirm_day_plans_to_records`、soft delete / restore は `soft_delete_record` / `restore_record` を使う。旧 `logs` view と Log 名 RPC alias は存在しない。

## 過去 Plan の時間編集

| 過去 Plan への操作               | 可否                                      |
| -------------------------------- | ----------------------------------------- |
| 予定時間の変更（移動・リサイズ） | ○（過去でも開始・終了を修正可）           |
| タグ・メモの訂正                 | ○                                         |
| 過去日付への新規 Plan 追加       | ✗（実際にやったことは予定外の Record へ） |
| ワンタップ記録 / skip / 削除     | ○                                         |

end が将来の Plan（進行中含む）は自由に編集可。end が過去になるように変更しても更新可能で、保存先ルールに従い必要なら Record として扱われます。Record 側は引き続き時間・タグ・note・fulfillment_score を通常通り訂正可能です。

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
