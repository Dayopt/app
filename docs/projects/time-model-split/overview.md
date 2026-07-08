---
status: current
last_verified: 2026-07-09
code: apps/product/src/features/entry
---

# time-model-split — entries を Plan / Log / 外部カレンダーミラーに分割する

[ADR-025](../../product/log/2026-07-09-time-model-split.md) で決定した時間管理モデル分割の全体設計書。決定の経緯・却下案は ADR-025 が正で、本書はそれをスキーマ・UI 方針・移行・影響範囲・Phase 構成に落とす。**大規模判定**（新テーブル・blast radius が entry/calendar/review/stats/API 横断）。

---

## 1. Goal

予定（Plan）と記録（Log）を独立エンティティに分離し、「予定を立てる → 記録する → 差分を見る → 次を改善する」のループを、1予定:N記録・予定外記録・外部カレンダー取り込みまで含めて破綻なく表現できるデータモデルにする。

## 2. 決定済みモデル

### plans（Dayopt 内の予定）

| カラム                               | 型                   | 制約                                                                      |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------- |
| id                                   | uuid PK              | `gen_random_uuid()`                                                       |
| user_id                              | uuid                 | FK → auth.users, ON DELETE CASCADE                                        |
| tag_id                               | uuid NULL            | FK → tags, ON DELETE SET NULL                                             |
| title                                | text NOT NULL        |                                                                           |
| note                                 | text NULL            |                                                                           |
| start_at / end_at                    | timestamptz NOT NULL | CHECK `end_at > start_at`                                                 |
| skipped_at                           | timestamptz NULL     | 「やらなかった」マーカー（ADR-025 で存続決定）                            |
| source                               | text NOT NULL        | `manual` / `external_calendar` / `api`。作成時に確定する不変の provenance |
| external_calendar_event_id           | uuid NULL            | FK → external_calendar_events                                             |
| created_at / updated_at / deleted_at | timestamptz          | soft delete は entries と同運用                                           |

- CHECK: `source = 'external_calendar'` ⇒ `external_calendar_event_id IS NOT NULL`
- EXCLUDE: `plans_no_overlap` — `(user_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE deleted_at IS NULL`

### logs（Dayopt 内の記録）

| カラム                                                                      | 型                   | 制約                                                                |
| --------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| id / user_id / tag_id / title / note / created_at / updated_at / deleted_at |                      | plans と同形                                                        |
| plan_id                                                                     | uuid NULL            | FK → plans。あり = 予定に対する記録（**1:N**）、なし = 予定外の記録 |
| start_at / end_at                                                           | timestamptz NOT NULL | CHECK `end_at > start_at`                                           |
| source                                                                      | text NOT NULL        | `manual` / `from_plan` / `external_calendar` / `api`                |
| external_calendar_event_id                                                  | uuid NULL            | FK → external_calendar_events                                       |
| fulfillment_score                                                           | integer NULL         | entries から移設（記録側の属性）                                    |

- CHECK: `source = 'from_plan'` ⇒ `plan_id IS NOT NULL`、`source = 'external_calendar'` ⇒ `external_calendar_event_id IS NOT NULL`
- EXCLUDE: `logs_no_overlap` — plans と同型
- オーナー整合: `plan_id` が同一 user の plan を指すことを constraint trigger で強制（`enforce_entry_tag_owner` パターンを流用）
- `plan_id` と `source` は独立次元（後から予定に紐づける `manual` + `plan_id` ありが正当に存在する）

### external_calendar_events（同期ミラー）

| カラム                                 | 型                   | 制約                                                      |
| -------------------------------------- | -------------------- | --------------------------------------------------------- |
| id / user_id / created_at / updated_at |                      |                                                           |
| provider                               | text NOT NULL        | `google` 等                                               |
| provider_event_id                      | text NOT NULL        | UNIQUE `(user_id, provider, provider_event_id)` で upsert |
| title / description / calendar_name    |                      | provider 値のミラー                                       |
| start_at / end_at                      | timestamptz NOT NULL |                                                           |
| status                                 | text NOT NULL        | provider 側状態（`confirmed` / `cancelled`）              |
| dismissed_at                           | timestamptz NULL     | ユーザーの「何もしない」。再同期で復活させない            |
| last_synced_at                         | timestamptz NOT NULL |                                                           |

- **provider 状態の純粋なミラー**。ユーザー編集不可・EXCLUDE 対象外・Review 集計対象外
- **ghost は導出概念**: ミラー − (plans/logs から参照済み) − (dismissed) − (cancelled)。Calendar にゴースト表示し、ワンタップで Plan / Log に変換
- 変換後に provider 側でイベントが変わってもミラーだけ更新し、変換済み plan/log は触らない
- 同期 window（目安 -90日/+90日、iCal export と同じ）で prune

### 重なりルール（ADR-018 の原則を継承）

- plans 同士・logs 同士: EXCLUDE で禁止。半開区間 `[)`（終端・始端の一致は許可）、per-user、`deleted_at IS NULL` のみ対象
- plans × logs: 許可（予定と記録は別レイヤー）
- external: 対象外（外部カレンダーは重なって当然）
- 緩和は実質不可逆（一度重なりデータが入ると再強化にデータ犠牲が伴う）— ADR-018 の警告をそのまま引き継ぐ

### 記録のデフォルト（ADR-019 の反転）

- 過去の予定は記録されるまで「未記録の予定」。自動で実績にならない
- **必須の緩和 UX**（これが無いと「軽く回す」が成立しない）: (a) plan ワンタップ「そのまま記録」（plan range をコピーした log を 1 タップで作成） (b) 一括「この日を確定」（その日の未記録 plan をまとめて log 化）
- `skipped_at`（やらなかった）と未記録（まだ記録していない）は別状態として Review で区別する

## 3. Review の差分分類

| 分類             | 定義                                                    |
| ---------------- | ------------------------------------------------------- |
| 未記録の予定     | 過去の plan で logs なし・未 skip                       |
| やらなかった予定 | `skipped_at` あり（実績集計から除外、計画履歴は残す）   |
| 予定に対する記録 | `plan_id` あり。差分 = plan duration − Σ(logs duration) |
| 予定外の記録     | `plan_id` なし                                          |

現行 `computeCalendarDayDiffs`（`apps/product/src/features/calendar/lib/day-diff.ts`）の 4 分類（unplanned / missed / shifted / resized）は 1:1 前提のため、1:N 前提で再定義する。

## 4. UI 方針（2026-07-09 確定）

### 2レーン構成 — Log が主役

- Calendar の各日カラムを Plan レーンと Log レーンに分けて横並びにする。**Log レーンが視覚的な主役**（塗りのカード）、Plan レーンは控えめ（アウトライン・淡色）。「カレンダーは予定を見せる、Dayopt は実際に何が起きたかを見せる」という戦略の濃淡をそのまま画面に反映する
- 密度対応: Day 表示は素直に 2 レーン。Week「予定+記録」モードは Plan を細レーンかアウトライン重ねで逃がし、モバイル Week は表示切替（予定だけ / 記録だけ）に逃がす（実装時に調整）

### 保存先は end で一意に決まる（選択 UI 不要）

- **`end_at > now` → Plan、`end_at <= now` → Log**。「未来の記録は作れない」「過去の予定は無意味」の帰結として、今をまたぐブロックを含むどの時間帯でも保存先が一意に決まる
- フォームの「予定として保存 / 記録として保存」チップはセレクタではなく**表示**。時間編集で境界をまたいだ瞬間に自動で切り替わる（色・ラベルが明確に変わり、ユーザーが驚かない）
- サイドバーのタグクリック作成: 今の時刻から始まるドラフト（end が未来）= Plan。時間を過去に編集すると Log に自動切替
- エディタは Plan / Log で共有する（乗せる内容は同じ）。destination チップだけが差し替わる

### Plan → Log の導線

- ワンタップ「そのまま記録」 / Plan カードを Log レーンへドラッグ（リサイズすればずれ込みで記録） / 一括「この日を確定」の 3 導線

### 差分はラベルではなく数字

- 予定通り / 予定外の二値ラベルは使わない。`plan_id` ありの log には差分を数字で添える（±0 は非表示 = 自然に「予定通り」と読める）。`plan_id` なしの log は「予定外」の静かなマーカーのみ
- copywriting ルール「判定せず数字で示す」に従う

### 過去 Plan の柔軟性（ADR-015 継承: 時間だけ凍結）

| 過去 Plan への操作               | 可否                                      |
| -------------------------------- | ----------------------------------------- |
| 予定時間の変更（移動・リサイズ） | ✗（時間は凍結。差分データの信頼性を守る） |
| タイトル・タグ・メモの訂正       | ○（時間フィールド以外は訂正可）           |
| 過去日付への新規 Plan 追加       | ✗（実際にやったことは予定外の Log へ）    |
| ワンタップ記録 / skip / 削除     | ○                                         |

- end が未来の Plan（進行中含む）は自由に編集可。ただし end を過去へ縮める操作は不可（早く終わったなら短い log で記録する）

## 5. Phase 構成

**Phase 1 — plans / logs 分割 + 明示記録化**（external なしで完結する）

1. Step 0: 統計 RPC 書き換え方針を決定済み — [step-0-statistics-rpc-policy.md](./step-0-statistics-rpc-policy.md)。結論: Plan / Log 分割後の統計ロジックは TS service 層へ移し、PL/pgSQL 統計 RPC と `entries_effective` は呼び出し元を消してから drop する
2. schema: plans / logs 作成、EXCLUDE・CHECK・trigger・RLS・index
3. migration: entries → plans / logs のデータ移行（下記 §7）
4. server: entry-service / router の分割（plans CRUD / logs CRUD / ワンタップ記録 / 一括確定）
5. domain / UI: CalendarEvent 射影、Plan layer + Log layer の描画、Inspector、Review 差分の再定義
6. 後始末: `entries_effective` view・entries テーブルの廃止、iCal export の対象決定（§8 未決 5）

**Phase 2 — 外部カレンダー取り込み**（Phase 1 リリース後に着手）

1. `calendar_connections` 相当（provider アカウント・OAuth token・同期対象カレンダー選択・sync cursor）の設計 — 3 テーブル案には含まれない追加要素
2. external_calendar_events ミラー + 同期ジョブ + prune
3. ghost 表示層と Plan / Log 変換 UX

## 6. Reversibility Table

| 項目                                           | タグ           | 備考                                                                                                         |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| plans / logs スキーマ追加                      | [hours]        | テーブル追加自体は無害                                                                                       |
| entries → plans/logs データ移行 + entries 廃止 | [days]         | 移行後に新テーブルへ書き込みが入ると逆変換にデータ修復判断が要る                                             |
| auto-record の実体化 backfill                  | [irreversible] | 実体化した logs と明示記録の区別が落ちる（§8 未決 4 で緩和策を決める）。ADR-019 の backfill と同種の非対称性 |
| 明示記録への UX 反転                           | [minutes]      | コードで戻せる。ただし反転後に蓄積した「未記録」の解釈は変わる                                               |
| EXCLUDE 制約（plans / logs）                   | [hours]        | 追加は容易。**緩和が実質不可逆**（ADR-018 継承）                                                             |
| iCal export の内容変更                         | [irreversible] | 外部購読者が見る URL 契約。変更前に §8 未決 5 を確定                                                         |

`[irreversible]` 2 件はどちらも migration / export 設計の中で先に決めてから実装する。

## 7. Migration 方針

1. `origin = 'planned'` の entries → plans（`start_time`/`end_time` → `start_at`/`end_at`、`skipped_at` 移設）
2. 明示確定 actual（`actual_start_time`/`actual_end_time` NOT NULL）→ logs（`plan_id` = 対応 plan、`source = 'from_plan'`、`fulfillment_score` 移設）
3. `origin = 'unplanned'` の entries → logs（`plan_id` NULL、`source = 'manual'`）
4. **auto-record の凍結**: actual NULL・過去・未 skip の planned entries は、移行時点の effective actual（= plan range）を一度だけ実体化して logs 化する。やらないと過去の Review が遡って「未記録」に変わる。`getEffectiveActualRange()` / `entries_effective` はこの backfill を最後の用途として廃止
5. soft delete 済み entries も対応テーブルへ `deleted_at` ごと移行（復元可能性を維持）

## 8. 未決事項（実装 Step 着手前に決める）

1. 別日実行の diff 帰属 — 火曜の予定を水曜にやって紐づけた時、log は log の日に計上・plan は自分の日に未達、が有力
2. plan と log の tag / title 乖離時、Review はどちらで束ねるか — log 側優先が有力
3. plan soft delete 時の紐づき logs の見せ方（「予定に対する記録」のままか「予定外」に落とすか）
4. 移行時に実体化した logs を明示記録と区別するか — ADR-019 は自動記録を見積もり精度の分母から除外していた。区別を落とすと精度指標が汚れる
5. iCal export（`/api/v1/calendar/[token]`）に plans / logs のどちらを出すか（両方なら 2 フィード）
6. ghost の有効期限・視覚表現（principles.md でも未確定）
7. MCP / API が公開している entries 形の契約をどう version するか
8. feature / ディレクトリ命名 — `features/log` は `@/lib/logger`（アプリログ）と紛らわしい。`features/logs` 等、衝突しない名前にする

## 9. Existing Code to Reuse

- `supabase/migrations/20260706120000_enforce_entry_tag_owner.sql` — オーナー整合 constraint trigger のパターン（logs.plan_id にも適用）
- `supabase/migrations/20260513000000_entry_two_layer_time_ranges.sql` L92-110 — EXCLUDE 制約の定義型（そのまま plans / logs に移植）
- `soft_delete_entry` / `restore_entry` RPC — soft delete 運用パターン
- `apps/product/src/features/entry/domain/entry-time-model.ts` `getEffectiveActualRange()` — migration backfill（§7-4）で最後に使用して廃止
- `apps/product/src/features/calendar/lib/day-diff.ts` — 差分分類の再定義ベース
- `apps/product/src/features/entry/lib/entry-to-ical.ts` — export 対象決定後に流用
- project skills: `trpc-router-creating` / `optimistic-update` / `supabase` / `test`

## 10. What I'm Not Doing

- 双方向同期(Dayopt → Google 書き込み) — one-way import + 既存 iCal export で足りる
- ghost の汎用テーブル化 — AI / MCP / ルーティン由来 ghost は将来別テーブルから ghost 表示層に合流（ADR-025 却下案）
- 繰り返し予定の独自展開 — provider が展開した instance をそのまま保存する
- Phase 1 / Phase 2 の同時リリース — 1 リリースに詰めない
- 「ついで」の統計リファクタ — RPC の書き換えは分割に必要な範囲に限定（方針は Phase 1 Step 0 で確定）
