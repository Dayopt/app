---
status: current
last_verified: 2026-07-24
code: apps/product/src/features/timeblock
public_docs:
  - plans
  - records
lp:
  - 'Plan and Record tracking'
---

# Plan / Record（予定 / 記録）

Dayoptの中心概念。「予定を立てる → 記録する → 差分を見る」のループを、Plan（予定）と Record（記録）の2エンティティで表現する。旧 Entry 単一モデル（計画・実績を1行で持つ）は ADR-025 で廃止した。

## 2エンティティ構成

- **Plan（予定）**: これからやる時間の宣言。`plans` テーブル
- **Record（記録）**: 実際に使った時間。物理 `records` テーブル
- **1 Plan : N Record**。`records.plan_id` があれば「予定に対する記録」、なければ「予定外の記録」
- 1つの予定に複数回の記録を紐づけられる（例: 途中で中断して後で再開した場合など）

## 新規作成時の保存先ルール（選択 UI なし）

- 新規作成時は **`end_at > now` → Plan、`end_at <= now` → Record** とし、時間範囲だけで保存先を決める
- 詳細 Inspector では開いた Plan / Record の種別を維持し、時間編集による暗黙変換はしない
- Plan から Record を作る場合は「そのまま記録」などの明示的な記録導線を使う
- エディタは Plan / Record で共有し、日時とメモを編集する

## 詳細 Inspector の保存

- 保存ボタンは表示しない
- タグは選択の確定時、日時は編集可能な状態で有効な日付・開始・終了が確定した時に自動保存する
- メモは入力停止から600ms後に自動保存し、フォーカス解除または Inspector を閉じる時は待機中の内容を即時保存する
- 更新は直列に実行し、保存待ちの変更は最新値へまとめる。各更新は表示開始時のraw `updated_at`をversionとして送り、DBが返したversionで次の更新を行う
- 他経路の更新と競合した場合は最新行を再取得する。再取得にも失敗した間は編集を凍結し、古いversionで上書きしない
- 自動保存中も入力を無効化しない。ただし未解決のversion競合中は追加のwriteを送らない
- 「そのまま記録」は表示中のタグ・メモを保存キューの末尾で確定し、その保存に成功してから Record を作る。保存失敗時は記録しない
- 過去 Plan は日時を読み取り専用にし、タグ・メモの訂正と記録操作は維持する

## 詳細 Inspector の関係表示

- Plan は active な関連 Record の件数、合計記録時間、タグ、日時を「関連する記録」として一覧表示する
- Record は `plan_id` がある場合、元 Plan のタグと予定日時を「元の予定」として表示する
- 関係行を選ぶと Calendar の表示期間は変えず、同じ Inspector 内で相手の詳細へ切り替える
- 通常 UI に raw `id` / `plan_id` は表示しない。関係先はタグと日時で識別する
- 関係先が削除済みなどで取得できない場合も raw ID は表示せず、中立的な取得不可状態を表示する
- 「そのまま記録」は関連 Record の取得に成功し、active な関連 Record が0件の場合だけ表示する。作成成功後は新しい Record の詳細へ切り替える

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

- **ワンタップ「そのまま記録」** — Plan の時間帯をそのままコピーし、`source = 'from_plan'` の Record を1件作成する。active な関連 Record がある Plan には重ねて作成しない
- **Record レーンへのドラッグ** — ドロップ時のプレビュー範囲を使い、`source = 'manual'` かつ元 Plan の `plan_id` を持つ Record を作成する。元 Plan の時間は変更せず、Record 同士が重ならない範囲で同じ Plan に複数の Record を紐づけられる
- **一括「この日を確定」** — その日の未記録 Plan をまとめて`confirm_day_plans_command_v1`でRecord化する。DSTを含む1日範囲として26時間を上限にする

ワンタップは予定どおりの時間を1件で確定する導線、Record レーンへのドラッグは実際の時間帯や分割した作業を記録する導線として使い分ける。

## Calendar の差分表示

- 同じ Plan に複数の関連 Record がある場合、差分は **関連 Record の合計時間 − Plan の時間** で計算する
- 差分バッジは関連 Record 群の代表カード1枚だけに表示し、各 Record に同じ Plan 時間を引いて差分を重複表示しない
- 差分が `±0` の場合はバッジを表示しない
- 差分バッジは中立色とし、正負は符号と方向アイコンで示す
- 差分パネルを開いている間は、一覧対象のPlan / Recordカードへcompare markerを表示する
- `plan_id` がない Record は予定外の記録として扱い、Plan との差分バッジは表示しない
- Record自身の終了が未来なら`RECORD_IN_FUTURE`、終了していないPlanへのリンクなら`PLAN_NOT_RECORDABLE`として区別する

## コピー / 貼り付け

- 詳細 Inspector とカードの右クリックにある共通の `…` メニューからコピーできる。選択中は `Cmd/Ctrl+C` でも同じコピー状態を作る
- コピー対象は Plan / Record の種別、タグ、メモ、開始時刻、長さ。元の `id` と `plan_id` は引き継がず、貼り付け先には独立した新規行を作る
- `Cmd/Ctrl+V` はコピー元の種別を維持する。Plan は未来、Record は過去にだけ貼り付けられ、条件外では種別を暗黙変換せずエラーを表示する
- Plan と Record の関連を作るのは「そのまま記録」などの記録導線だけ。通常のコピーでは関連を作らない

## Inspectorの時間編集

- 時刻入力が確定した時点で、query cacheにある同一レーンのブロックとの重複を判定する。Plan同士・Record同士だけを禁止し、PlanとRecordの相互重複は許可する
- 編集中のブロック自身は重複判定から除外する。隣接する半開区間は重複にしない
- 重複時は日時入力をエラー表示にし、直下に`TimeConflictAlert`を表示して自動保存を行わない。空き時間へ変更するとエラーを解除して保存する
- client判定は応答速度のためのbest-effortであり、cache外の行と同時更新に備えてserver validationを正として維持する。serverが重複を拒否した場合も同じインラインエラーを表示する

## 複製

- 詳細 Inspector とカードの右クリックにある共通の `…` メニューから、Plan / Record の両方を複製できる
- 複製を選ぶと同じ Inspector に未保存の詳細カードを表示し、タグ、メモ、所要時間、Plan / Record の種別を引き継ぐ
- Plan は未来、Record は過去の時間だけを受け付け、種別を暗黙変換しない
- 作成時に同一レーンの既存ブロックと重複した場合は行を作らず、サイドバーのタグ作成と同じ `TimeConflictAlert` を日時入力の直下に表示する。重複トーストは出さず、日時を変更するまで作成を無効にする
- 複製下書きは自動保存せず、「複製を作成」で独立した新規行を作る。元の `id` / `plan_id`、skip、関連 Record、外部カレンダー関係は引き継がない
- キャンセル時は新規行を作らず、元ブロックの詳細へ戻る

## DB 契約

物理DB、正本command、生成型はRecordに統一済み。テーブルは`records`、通常UIのPlan / Record writeは`*_command_v1`をservice-owned adapter経由で実行する。一括確定は`confirm_day_plans_command_v1`を使う。update / soft delete / restore / skip / record化はraw `updated_at`のexact CASを必須とする。

authenticatedのPlan / Record直接DMLはrevoke済みで、現在のアプリケーション契約ではない。rolling deploy中の旧bundleが使う旧CASなしwrite RPCは、owner検証とuser単位lockを行う一時compatibility wrapperとしてだけ残す。旧deploymentのdrain確認後に別migrationでrevokeする。旧`logs` viewとLog名RPC aliasは存在しない。

タグ削除・再割当て・mergeは複数Plan / Recordを一括で扱うservice-owned例外writerであり、単行commandへは載せない。関連処理、子タグ昇格、タグ削除を一つのDB transactionとuser単位exclusive advisory lockで行う。再割当て・merge・detachはDBの`updated_at` triggerでversionを進め、通常UIや外部writeが古いversionを上書きできないようにする。タグと一緒にブロックを削除する明示操作だけはhard deleteを行う。

Settingsの「すべてのブロックを削除」と「すべてのデータを削除」もservice-ownedの明示的hard deleteであり、単行commandのsoft deleteとは別契約とする。`auth.users`のparent-first lockとuser単位exclusive advisory lockで通常UI/MCP writeを直列化する。writerが先なら後続削除後の最終状態は削除済み、削除が先なら後続writerは成功できる。

「すべてのデータを削除」は現在Plan、Record、tag、user settingsを対象とし、OAuth connection/tokenとMCP mutation receiptは対象外である。接続済みappを同時に無効化するか、削除後もappがデータを追加できることを文言で明示するかはMCP write tool公開前のproduct checkpointとする。

## 過去 Plan の時間凍結

| 過去 Plan への操作               | 可否                                      |
| -------------------------------- | ----------------------------------------- |
| 予定時間の変更（移動・リサイズ） | ✗（差分データの信頼性を守るため凍結）     |
| タグ・メモの訂正                 | ○                                         |
| 過去日付への新規 Plan 追加       | ✗（実際にやったことは予定外の Record へ） |
| ワンタップ記録 / skip / 削除     | ○                                         |

終了が将来の Plan（進行中を含む）は編集できる。ただし終了を現在以前へ縮めることはできず、早く終わった事実は短い Record として記録する。Record は終了が現在以前の範囲で、時間・タグ・メモを訂正できる。

## 重なり制約

- Plan 同士・Record 同士: EXCLUDE 制約で禁止（半開区間 `[)`、per-user、`deleted_at IS NULL` のみ対象）
- Plan × Record: 許可（予定と記録は別レイヤーなので重なってよい）
- Plan を Record レーンへドラッグする時は、ドロップ範囲を既存 Record と照合する。Plan との重なりは拒否理由にしない
- 緩和は実質不可逆（一度重なりデータが入ると再強化にデータ犠牲が伴う）

## 関連する意思決定

- [検索対象と表示をtag・メモに揃え、結果は対象ブロックを開く操作に限定する](../log/2026-07-15-feedback-block-search-tag-note.md)
- [ADR-025 時間管理モデルを Plan / Record / 外部カレンダーミラーの3概念に分割する](../log/2026-07-09-time-model-split.md)
- [ADR-015 時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [ADR-018 時間重なりの全面禁止](../log/2026-05-13-time-overlap-prohibition.md)
- [ADR-020 entries の論理削除](../../engineering/log/2026-03-18-soft-delete-model.md)
- [機能スコープ: やらないことを決める](../log/2026-06-16-feature-non-adoption.md)（繰り返し予定を採用しない理由）
