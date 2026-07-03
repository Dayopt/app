# ADR-019: 自動記録モデル（過ぎた予定を実績とみなす）

> accepted（2026-06-10）

---

## コンテキスト

[ADR-011](../../engineering/log/2026-03-05-unified-block-model.md) で plans / records を単一 `entries` テーブルに統合した時点では、`origin` は `'planned'` のみで、実績は別途記録する想定だった。だが時間記録の最大の障壁は記録の手間である。Toggl 型の「開始」「停止」を能動的に押させる方式は押し忘れ・後付け修正が常態化する。

Dayopt は既にユーザーに「予定を立てる」行為を求めている。その予定が過ぎた時点で実績として確定させれば、追加の記録作業は不要になる。「予定通りに過ごした」が最も多いケースであり、そのケースで入力ゼロにすることが体験上の最大の勝ち筋である。

---

## 決定

「予定が過去になったら、ユーザーが何もしなくても自動で実績になる」を中核モデルとする。実績を別途記録するのではなく、**過ぎた予定そのものを実績とみなす**。

1. `actual_start_time` / `actual_end_time` は「ユーザーが編集・確定した実績」のみを保持する（NULL = 未編集）
2. **effective actual を読み取り時に算出する（cron 不要）**:
   - actual が両方 NOT NULL → その値（明示確定した実績）
   - planned かつ `skipped_at IS NULL` かつ `end_time <= now()` → plan range（自動記録）
   - それ以外（未来の planned / skipped）→ 実績なし（NULL）
3. `skipped_at` で「計画したがやらなかった」を表現する（実績集計から除外、計画履歴は残す。skip と実績は排他）
4. `entries_effective` view を effective actual の唯一の正とする。統計 RPC はすべてこの view を読む

実装: `supabase/migrations/20260610000000_entry_auto_record_model.sql`

---

## 詳細

### なぜ cron でなく読み取り時算出か

「過去になった予定を実績テーブルへ書き込む」バッチ方式は採らなかった。now() を跨いだ瞬間に状態が変わるだけなので書き込みは冗長で、バッチ遅延・失敗で不整合が生じる。effective actual は `COALESCE(actual, 過去かつ未skipの plan range)` という純関数で表現でき、view 1 つに閉じ込められる。書き込みは「ユーザーが実績を明示編集した時」だけになり、状態機械が単純になる。

### 定義の二重実装（同期義務）

effective actual の定義は **DB（`entries_effective` view、`security_invoker = true`）と TS（`features/entry/domain/entry-time-model.ts` の `getEffectiveActualRange()`）の 2 箇所**にある。view が唯一の正で、TS はその同義実装。**片方だけ変えると集計と表示がずれるため、変更時は必ず両方を同時に更新する。**

### 見積もり精度は明示確定 actual のみ

actual NULL（自動記録）は plan range をそのまま実績にするため deviation が常にゼロに見え、精度指標のノイズになる。そこで見積もり精度系の集計は actual を明示確定した行（actual NOT NULL）だけを分母にする。

---

## 結果

### メリット

- 予定通りなら記録ゼロ（「記録の手間ゼロ」の実現）
- cron 不要で状態機械が単純
- 自動記録と明示実績を NULL で区別でき、精度指標のノイズを除ける

### トレードオフ

- **now() 依存**: effective actual は読み取り時刻に依存する。集計は「いつ集計したか」で結果が変わりうる（設計上正しい挙動だが、テスト・キャッシュ時に意識が必要）
- **「予定通り」と「未編集」を区別しない**: actual = NULL は「まだ触っていない」と「予定通りで触る必要がなかった」の両方を意味する
- **二重定義の同期義務**: view と TS の 2 箇所を常に揃える必要がある

### 不可逆性

view / RPC / 制約の定義変更は code 変更で戻せる。ただし導入 migration の backfill は実質不可逆。20260513 で plan からコピーされていた actual を「plan range と完全一致なら未編集とみなして NULL に戻す」処理を行った（同 migration L85-91）。当時のプロダクトに「予定と同じ実績を明示確定した」状態は存在しなかったため情報損失ゼロと判断したが、一度 NULL 化したものは復元できない。

### 再訪条件

- 「予定通りと明示的に確認した」状態を自動記録と区別したい要求が出たとき → actual NULL の二値表現を拡張する設計を再検討する
- 外部カレンダー同期で実績確定タイミングを now() 依存にできない要求が出たとき

---

## 関連

- [ADR-011](../../engineering/log/2026-03-05-unified-block-model.md) — 統合ブロックモデル（本 ADR が拡張するデータモデル。`origin = 'unplanned'` と actual 二層を追加）
- [ADR-015](./2026-03-10-time-immutability-principle.md) — 時間不変原則（過去ブロックの actual 編集は許可、予定編集は禁止）
- [ADR-018](./2026-05-13-time-overlap-prohibition.md) — 時間重なり全面禁止（自動記録の防衛線分担）
- `supabase/migrations/20260610000000_entry_auto_record_model.sql` — モデル導入
- `apps/product/src/features/entry/domain/entry-time-model.ts` — `getEffectiveActualRange()`
