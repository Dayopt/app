# 自動記録モデル（予定が過去になったら自動で記録になる）

## 基本情報

- **決定日**: 2026-06-10
- **決定者**: 創業者
- **ステータス**: 承認済み（実装済み）
- **カテゴリ**: アーキテクチャ / プロダクト
- **関連**: [ADR-002（Record機能の設計決定）](002-record-feature-design.md) の DB モデルを supersede / [ADR-010（時間重なり全面禁止）](010-time-overlap-prohibition.md) の前提

## 決定事項

### 概要

「予定が過去になったら、ユーザーが何もしなくても自動で実績になる」。これが Dayopt の時間記録の中核モデルである。実績入力を能動的な作業にせず、**記録の手間をゼロ**にする。実績を別途記録するのではなく、**過ぎた予定そのものを実績とみなす**ことでこれを実現する。

### 決定内容

1. **単一テーブル `entries`** に planned / unplanned の両方を持つ（`origin` で区別）。ADR-002 の「Plan / Record を別テーブルにし 1:N で紐づける」設計は採用せず、1 エントリが計画レイヤーと実績レイヤーを同時に持つ二層モデルに置き換えた。

2. **`actual_start_time` / `actual_end_time` は「ユーザーが編集・確定した実績」のみを保持する**。NULL = 未編集。予定通りに過ごした場合、ユーザーは何も入力せず actual は NULL のままでよい。

3. **effective actual を読み取り時に算出する（cron 不要）**。集計や表示で使う「実効的な実績 range」は次の規則で導出する:
   - actual が両方 NOT NULL → その値（ユーザーが明示確定した実績）
   - planned かつ `skipped_at IS NULL` かつ `end_time <= now()` → plan range（自動記録）
   - それ以外（未来の planned / skipped）→ 実績なし（NULL）

4. **`skipped_at` で「計画したがやらなかった」を表現する**。skip された行は実績集計から除外されるが、計画履歴としては残る。skip と実績は排他（`entries_skip_shape` 制約）。

5. **`entries_effective` view を effective actual の唯一の正とする**。統計 RPC はすべてこの view（`effective_start_time` / `effective_end_time`）を読む。アプリ側の同義実装は [`features/entry/domain/entry-time-model.ts`](../../apps/product/src/features/entry/domain/entry-time-model.ts) の `getEffectiveActualRange()`。view は `security_invoker = true` で呼び出し側 RLS を適用する。

実装: [`supabase/migrations/20260610000000_entry_auto_record_model.sql`](../../supabase/migrations/20260610000000_entry_auto_record_model.sql)

## 背景・理由

### なぜ「自動記録」か

タイムトラッキングの最大の障壁は記録の手間である。Toggl 型のツールは「開始」「停止」を能動的に押させるため、押し忘れ・後付け修正が常態化する。Dayopt は「予定を立てる」という行為を既にユーザーに求めているので、**その予定が過ぎた時点で実績として確定させれば、追加の記録作業は不要**になる。「予定通りに過ごした」が最も多いケースであり、そのケースで入力ゼロになることが体験上の最大の勝ち筋である。

### なぜ cron でなく読み取り時算出か

「過去になった予定を実績テーブルへ書き込む」バッチ（cron）方式も検討したが、採らなかった。理由:

- now() を跨いだ瞬間に状態が変わるだけなので、書き込みは純粋に冗長
- バッチ遅延・失敗で「実績がまだ反映されない」不整合が生じうる
- effective actual は `COALESCE(actual, 過去かつ未skipの plan range)` という純関数で表現でき、view 1 つに閉じ込められる

読み取り時算出なら、書き込みは「ユーザーが実績を明示編集した時」だけになり、状態機械が単純になる。

### actual NULL = 未編集 という表現の含意

actual を「未編集 = NULL」で表すことで、「自動記録（予定通り）」と「明示確定した実績」を区別できる。これは見積もり精度の集計で効く。自動記録は plan range をそのまま実績にするため deviation が常にゼロに見え、精度指標のノイズになる。そこで**見積もり精度系の集計は actual を明示確定した行（actual NOT NULL）だけを分母にする**。

## 検討内容

### 検討した選択肢

#### 選択肢A: 過ぎた予定を実績とみなす（自動記録 / 読み取り時算出）- 採用

- **メリット**: 予定通りなら記録ゼロ / cron 不要 / 状態機械が単純 / 自動記録と明示実績を NULL で区別できる
- **デメリット**: now() 依存で読み取り時刻により effective actual が変わる / 「予定通りと明示確認した」状態を表現できない

#### 選択肢B: ADR-002 の Plan/Record 別テーブル（明示記録）- 却下

- **メリット**: 計画と実績が物理的に分離され、1 計画に複数実績を紐づけられる
- **デメリット**: 実績入力が能動作業になり記録の手間が残る / Plan:Record の整合管理が複雑 / 「記録の手間ゼロ」という勝ち筋を捨てる
- **却下理由**: 実装前に「記録の手間ゼロ」をプロダクトの主軸に据える判断へ転換した。別テーブル方式は手間の削減と両立しない

#### 選択肢C: cron で実績を物理書き込み - 却下

- **却下理由**: 上記「なぜ cron でなく読み取り時算出か」の通り。冗長かつ不整合リスクを持ち込む

### 採用理由

「記録の手間ゼロ」を最優先のプロダクト価値とし、それをデータモデルで素直に表現できるのが選択肢A だった。effective actual を純関数（view）に閉じ込めることで、DB とアプリの実装が一意に対応し、集計の一貫性も保てる。

## トレードオフ・既知の制約

- **now() 依存**: effective actual は読み取り時刻に依存する。未来の予定は実績ゼロ、過ぎた瞬間に実績へ変わる。集計は「いつ集計したか」で結果が変わりうる（設計上の正しい挙動だが、テスト・キャッシュ時に意識が必要）。
- **「予定通り」と「未編集」を区別しない**: actual = NULL は「まだ触っていない」と「予定通りで触る必要がなかった」の両方を意味する。両者を区別する `confirmed` のような状態は持たない。
- **二重定義の同期義務**: effective actual の定義は DB（`entries_effective` view）と TS（`getEffectiveActualRange`）の 2 箇所にある。片方だけ変えると集計と表示がずれる。**変更時は必ず両方を同時に更新する**。

## 自動記録と時間重なり防衛（ADR-010 との関係）

actual NULL の自動記録エントリは、actual レイヤーの `EXCLUDE` 制約の対象外になる（制約は両端 NOT NULL を要求するため）。そのため自動記録同士の二重計上を防ぐ防衛線は DB 制約ではなく**サービス層** `EntryService.ensureNoOverlaps`（[`entry-service.ts`](../../apps/product/src/features/entry/server/entry-service.ts) L687-747）の effective actual チェックにある。詳細は [ADR-010](010-time-overlap-prohibition.md) を参照。

## ADR-002 との関係

ADR-002 が定義した DB モデル（別テーブル `records` / `record_tags` / `record_activities`、`plan_id` による 1:N、`satisfaction` カラム）は本 ADR で **supersede** される。ADR-002 の価値定義（選択型ログ＝計画と実績を対比する、タグ共通、満足度記録）は引き継ぐが、その実現手段は単一 `entries` テーブル + 二層 range + 自動記録に置き換わっている。ADR-002 は歴史的経緯として保持する。

## 不可逆性

- view / RPC / 制約の定義変更は code 変更で戻せる（**[minutes]〜[hours]**）。
- ただし導入 migration の **backfill は実質不可逆**（**[days]寄り**）。20260513 で plan からコピーされていた actual を「plan range と完全一致なら未編集とみなして NULL に戻す」処理を行った（[同 migration L85-91](../../supabase/migrations/20260610000000_entry_auto_record_model.sql)）。これにより「ユーザーが予定と同じ実績を明示確定した」情報があれば失われる。当時のプロダクトにその状態は存在しなかったため情報損失ゼロと判断したが、一度 NULL 化したものは復元できない。

## 再訪条件

- 「予定通りと明示的に確認した」状態（自動記録と区別したいケース）を表現する要求が出たとき → actual NULL の二値表現を拡張する設計を再検討する
- 外部カレンダー同期で、外部由来イベントの実績確定タイミングを now() 依存にできない要求が出たとき

---

**更新履歴**

- 2026-06-16: 初版作成（Issue #1282 起点の ADR 整備）
  </content>
