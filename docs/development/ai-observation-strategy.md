# AI戦略方向転換 実装計画 — Part A: DB + バックエンド

## Context

Dayoptを「チャットベースAI」から「観察と通知の見守りAI」に転換する。Part Aではバックエンド基盤を構築する: plans/recordsテーブルの`entries`統合、振り返りAIパイプライン、集計クエリ、通知基盤、異常検知。フロントエンド統合（hooks, stores, UI, records feature削除）は Part B で実施。

---

## 共通設計判断

### `entries` テーブルスキーマ（統合後）

```sql
entries:
  id UUID PK DEFAULT gen_random_uuid()
  user_id UUID FK→auth.users ON DELETE CASCADE
  title TEXT NOT NULL
  description TEXT
  -- entry_number (旧plan_number) は削除

  start_time TIMESTAMPTZ
  end_time TIMESTAMPTZ
  duration_minutes INT

  origin TEXT NOT NULL DEFAULT 'planned'
    CHECK (origin IN ('planned', 'unplanned'))

  fulfillment_score INT CHECK (fulfillment_score BETWEEN 1 AND 3)
  -- 1: 微妙, 2: 普通, 3: 良い

  reminder_enabled BOOLEAN DEFAULT false

  reviewed_at TIMESTAMPTZ
  -- 旧completed_at。充実度入力時にセット。

  created_at TIMESTAMPTZ DEFAULT now()
  updated_at TIMESTAMPTZ DEFAULT now()
```

### `status` カラム廃止 → 時間ベース自動判定

```typescript
// src/lib/entry-status.ts（新規）
function getEntryState(entry: Entry): 'upcoming' | 'active' | 'past' {
  const now = new Date();
  if (!entry.start_time || !entry.end_time) return 'upcoming';
  if (new Date(entry.start_time) > now) return 'upcoming';
  if (new Date(entry.end_time) > now) return 'active';
  return 'past';
}
```

### リネーム対象

| 旧名                    | 新名                     | FKカラム               |
| ----------------------- | ------------------------ | ---------------------- |
| `plans`                 | `entries`                | —                      |
| `plan_tags`             | `entry_tags`             | `plan_id` → `entry_id` |
| `plan_templates`        | `entry_templates`        | —                      |
| `notifications.plan_id` | `notifications.entry_id` | FK参照先も変更         |

### 既存チャット機能

`src/features/ai/`, `src/app/api/chat/` は**現状維持**。Part A/B では変更しない。

### 価値観データ

既存（変更不要）:

- `user_settings.personalization_values` (JSONB)
- `user_settings.personalization_ranked_values` (JSONB)
- `prompt-builder.ts` が `rankedValues` をプロンプトに含めている

セッション2.3でAIプロンプトに価値観 + タグ別時間を渡し、LLM推論で接続する。

---

## セッション1.1: DBマイグレーション

**目的:** テーブルリネーム + records吸収 + status廃止 + 充実度3段階化

### マイグレーションSQL

```sql
-- Step 1: plans にカラム追加
ALTER TABLE plans ADD COLUMN origin TEXT NOT NULL DEFAULT 'planned'
  CHECK (origin IN ('planned', 'unplanned'));
ALTER TABLE plans ADD COLUMN fulfillment_score INT
  CHECK (fulfillment_score BETWEEN 1 AND 3);
ALTER TABLE plans ADD COLUMN duration_minutes INT;

-- Step 2: records データを plans に移行
CREATE TEMP TABLE record_to_plan_map (record_id UUID, new_plan_id UUID);

WITH inserted AS (
  INSERT INTO plans (
    user_id, title, description,
    start_time, end_time, duration_minutes,
    fulfillment_score, origin, reviewed_at,
    created_at, updated_at
  )
  SELECT
    r.user_id,
    COALESCE(r.title, ''),
    r.description,
    CASE WHEN r.start_time IS NOT NULL
      THEN (r.worked_at || 'T' || r.start_time)::timestamptz
      ELSE r.worked_at::timestamptz
    END,
    CASE WHEN r.end_time IS NOT NULL
      THEN (r.worked_at || 'T' || r.end_time)::timestamptz
      WHEN r.start_time IS NOT NULL
      THEN (r.worked_at || 'T' || r.start_time)::timestamptz
           + (r.duration_minutes || ' minutes')::interval
      ELSE r.worked_at::timestamptz + (r.duration_minutes || ' minutes')::interval
    END,
    r.duration_minutes,
    CASE
      WHEN r.fulfillment_score IN (1, 2) THEN 1
      WHEN r.fulfillment_score = 3 THEN 2
      WHEN r.fulfillment_score IN (4, 5) THEN 3
      ELSE NULL
    END,
    CASE WHEN r.plan_id IS NOT NULL THEN 'planned' ELSE 'unplanned' END,
    r.created_at, r.created_at, r.updated_at
  FROM records r
  RETURNING id, xmin
)
INSERT INTO record_to_plan_map
SELECT r.id, i.id FROM records r JOIN inserted i ON ...;

-- Step 3: record_tags → plan_tags
INSERT INTO plan_tags (user_id, plan_id, tag_id)
SELECT rt.user_id, m.new_plan_id, rt.tag_id
FROM record_tags rt JOIN record_to_plan_map m ON rt.record_id = m.record_id
ON CONFLICT DO NOTHING;

-- Step 4: (削除済み) record_activities → plan_activities → entry_activities
-- entry_activities テーブルは未使用のため削除済み (20260414100000_drop_entry_activities.sql)

-- Step 5: status廃止 + completed_at → reviewed_at
ALTER TABLE plans DROP COLUMN status;
ALTER TABLE plans RENAME COLUMN completed_at TO reviewed_at;
ALTER TABLE plans DROP COLUMN plan_number;

-- Step 6: テーブルリネーム
ALTER TABLE plans RENAME TO entries;
ALTER TABLE plan_tags RENAME TO entry_tags;
ALTER TABLE plan_tags RENAME COLUMN plan_id TO entry_id;
-- entry_activities は削除済み
ALTER TABLE plan_templates RENAME TO entry_templates;
ALTER TABLE notifications RENAME COLUMN plan_id TO entry_id;

-- Step 7: 統計関数の更新（plans→entries参照に変更）
-- get_plan_summary → get_entry_summary 等

-- Step 8: 旧テーブル削除
DROP TABLE record_activities;
DROP TABLE record_tags;
DROP TABLE records;
```

### 型定義の変更

| ファイル                                      | 変更内容                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/core/types/plan.ts` → `entry.ts`         | Plan→Entry、origin/fulfillment_score/duration_minutes/reviewed_at追加、status/completed_at/plan_number削除 |
| `src/core/types/record.ts`                    | FulfillmentScore: 1\|2\|3 に変更、RecordRow等は不要（Entryに統合）                                         |
| `src/schemas/plans/` → `src/schemas/entries/` | createEntrySchema（origin, fulfillment_score追加）                                                         |
| `src/lib/database.types.ts`                   | `supabase gen types` で再生成                                                                              |

**新規:** `src/lib/entry-status.ts` — `getEntryState()`, `isEntryPast()`

### 検証

- `npm run typecheck` パス
- Staging: `SELECT count(*) FROM entries WHERE origin = 'unplanned'` = 旧records数

---

## セッション1.2: サービス層・tRPCルーター統合

**目的:** records系をentries系に統合、全テーブル参照をentriesに切り替え

### リネーム・統合

| 旧                                              | 新                                             |
| ----------------------------------------------- | ---------------------------------------------- |
| `src/server/services/plans/plan-service.ts`     | `src/server/services/entries/entry-service.ts` |
| `src/server/services/plans/types.ts`            | `src/server/services/entries/types.ts`         |
| `src/server/services/records/record-service.ts` | **削除**（entry-serviceに吸収）                |
| `src/server/services/records/types.ts`          | **削除**                                       |
| `src/server/api/routers/plans/`                 | `src/server/api/routers/entries/`              |
| `src/server/api/routers/records/`               | **削除**                                       |

### EntryService拡張

- `list()`: originフィルタ、fulfillment_scoreフィルタ、日付範囲フィルタ
- `create()`: originの自動判定（start_timeが過去→unplanned）
- `update()`: fulfillment_score更新対応
- `checkTimeOverlap()`: RecordServiceから移植
- `from('plans')` → `from('entries')` 全置換

### tRPCルーター

```typescript
// src/server/api/root.ts
entries: entriesRouter,   // plans + records を統合
// records: recordsRouter  ← 削除
```

### AI関連の変更

| ファイル                                    | 変更                                                       |
| ------------------------------------------- | ---------------------------------------------------------- |
| `src/server/services/ai/context-service.ts` | `from('records')` → `from('entries')` + 時間ベースフィルタ |
| `src/server/services/ai/tools.ts`           | `searchRecords` → `searchPastEntries`                      |
| `src/server/api/routers/plans/statsView.ts` | plansとrecordsの別クエリ → entriesのみに簡素化             |

### 検証

- `npm run typecheck` パス
- `npm run lint && npm run lint:boundaries` パス
- Grep: `from('plans')` と `from('records')` がサーバーコードにゼロ

---

## セッション2.1: reflectionsテーブル + tRPCルーター

**目的:** 振り返りデータの永続化基盤

### マイグレーション

```sql
CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL,
  activities JSONB NOT NULL DEFAULT '[]',
  insights TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  model_used TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  user_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);
```

### 新規ファイル

- `src/server/services/reflections/reflection-service.ts` — CRUD + RLS
- `src/server/api/routers/reflections.ts` — list, getById, updateNote

---

## セッション2.2: 集計クエリ + ゲーミフィケーション指標

**目的:** 振り返り + ゲーミフィケーションに必要な全集計関数を構築

### 振り返り用DB関数

```sql
-- 週次サマリー（計画vs実績、タグ別時間、充実度）
CREATE OR REPLACE FUNCTION get_weekly_reflection_data(
  p_user_id UUID, p_week_start DATE
) RETURNS JSON;

-- 充実度トレンド
CREATE OR REPLACE FUNCTION get_fulfillment_trend(
  p_user_id UUID, p_start_date DATE, p_end_date DATE
) RETURNS TABLE (date TEXT, avg_score DOUBLE PRECISION, count INT);

-- エネルギーマップ（時間帯×曜日×充実度）
CREATE OR REPLACE FUNCTION get_energy_map(
  p_user_id UUID, p_start_date DATE, p_end_date DATE
) RETURNS TABLE (hour INT, dow INT, avg_fulfillment DOUBLE PRECISION,
                 total_minutes DOUBLE PRECISION, entry_count INT);
```

### ゲーミフィケーション指標

```sql
-- タイムボクシング遵守率
CREATE OR REPLACE FUNCTION get_timeboxing_adherence(
  p_user_id UUID, p_start_date DATE, p_end_date DATE
) RETURNS JSON;
-- → { adherence_rate, total_planned, on_time }

-- 週別集中スコア（充実度×時間の加重平均）
CREATE OR REPLACE FUNCTION get_weekly_focus_score(
  p_user_id UUID, p_weeks INT DEFAULT 8
) RETURNS TABLE (week_start TEXT, focus_score DOUBLE PRECISION,
                 total_minutes DOUBLE PRECISION);

-- 連続記録日数ストリーク: 既存 get_active_dates を entries に更新、JS側で計算
```

### 新規ファイル

- `src/server/services/reflections/data-aggregation-service.ts` — DB関数呼び出し + データ整形
- `src/server/services/gamification/gamification-service.ts` — 遵守率、ストリーク、集中スコア
- マイグレーションSQLファイル

### tRPC追加

- `reflections.getAggregationData` — 週次集計データ取得
- `gamification.getMetrics` — ゲーミフィケーション指標取得

---

## セッション2.3: AI振り返り生成パイプライン

**目的:** Claude APIで振り返りレポートを自動生成

### 新規ファイル

- `src/server/services/reflections/generation-service.ts`
  1. data-aggregation-serviceで統計データ取得
  2. user_settingsからパーソナライゼーション取得（**価値観ランキング**を含む）
  3. 振り返り専用プロンプト構築
  4. AI API呼び出し（Haiku 4.5で生成）
  5. reflectionsテーブルに保存

- `src/server/services/reflections/prompt-template.ts`
  - 入力: 統計データ + タグ別時間配分 + 充実度トレンド + **価値観ランキング**
  - 指示: 「ユーザーの価値観とタグの関連を推論し、乖離があればナッジする」
  - 出力フォーマット: `{ title, insights, question, activities }` JSON

- コールドスタート対策: `src/server/services/gamification/data-readiness-service.ts`
  - ユーザーのデータ蓄積状況を計算
  - `{ totalEntries, totalDays, fulfillmentRate, readiness }` を返す
  - 解放条件: 振り返り=1週間, エネルギーマップ=4週間, 異常検知=4週間

### tRPC追加

- `reflections.generate` — 冪等（同一期間の既存レポートがあればそれを返す）
- ai_usageクォータチェック（無料枠: 30回/月, Haiku 4.5）

---

## セッション2.5: 通知基盤拡張 + Edge Function

**目的:** AI通知タイプ追加 + 振り返り自動生成のEdge Function

### 通知テーブル拡張

```sql
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'reminder', 'overdue',
    'ai_insight', 'weekly_report', 'burnout_warning', 'energy_insight'
  ));
ALTER TABLE notifications ADD COLUMN data JSONB DEFAULT '{}';
ALTER TABLE notifications ADD COLUMN reflection_id UUID REFERENCES reflections(id);
```

### Edge Function

- `supabase/functions/generate-reflections/index.ts`
  - `check-reminders` と同パターン（既存参照: `supabase/functions/check-reminders/`）
  - pg_cronで週次スケジュール（月曜朝）
  - バッチサイズ制限（10ユーザー/回、タイムアウト対策）
  - generation-service呼び出し + `weekly_report` 通知作成

---

## セッション2.7: 異常検知ロジック

**目的:** バーンアウト予防のための異常検知サービス

### 新規ファイル

- `src/server/services/ai/anomaly-service.ts`
  - 過去4週平均 vs 今週比較
  - 検知項目:
    - 充実度急落（平均から-1以上の乖離）
    - 記録時間急増（平均の1.5倍以上）
    - 無記録日連続（3日以上）
  - 閾値超過で `burnout_warning` 通知生成

### Edge Function拡張

- `generate-reflections` Edge Function内で異常検知も実行
- 異常検知結果を `notifications` テーブルに保存（type: `burnout_warning`）

---

## セッション依存関係

```
セッション1.1 (DBマイグレーション)
  ↓
セッション1.2 (サービス層・tRPC統合)
  ↓
セッション2.1 (reflectionsテーブル)
  ↓
セッション2.2 (集計クエリ + ゲーミフィケーション)
  ↓
セッション2.3 (AI生成パイプライン + コールドスタート対策)
  ↓
セッション2.5 (通知 + Edge Function)  ← 2.3に依存
  ↓
セッション2.7 (異常検知)  ← 2.5に依存（Edge Function拡張）
```

---

## リスクと軽減策

| リスク                                 | 影響 | 軽減策                                                       |
| -------------------------------------- | ---- | ------------------------------------------------------------ | --- | --- | --- | ------------------------- |
| テーブルリネーム+統合でデータ損失      | 高   | マイグレーション前にpg_dump、record→entry ID対応テーブル保持 |
| status廃止による既存ロジック破壊       | 高   | `getEntryState()` で全箇所を統一置換                         |
| 充実度5→3変換の情報損失                | 低   | 既存データは少量、CASE文で最善マッピング                     |
| Edge Function AI呼び出しのタイムアウト | 中   | バッチサイズ制限（10ユーザー/回）                            |
| records系のDATE+TIME→TIMESTAMPTZ変換   | 中   | マイグレーションで `(worked_at                               |     | 'T' |     | start_time)::timestamptz` |

---

## 検証チェックリスト

**セッション1.1-1.2完了時:**

- [ ] `npm run typecheck` パス
- [ ] `npm run lint && npm run lint:boundaries` パス
- [ ] Grep: `from('plans')` と `from('records')` がサーバーコードにゼロ
- [ ] Staging: `entries` テーブルにrecordsデータが移行済み
- [ ] Staging: `records` テーブルが存在しない

**セッション2.1-2.3完了時:**

- [ ] reflectionsテーブル作成・CRUD動作
- [ ] 集計DB関数がStaging上で正常動作
- [ ] AI振り返り生成が tRPC経由で動作

**セッション2.5-2.7完了時:**

- [ ] Edge Function がpg_cronで実行
- [ ] AI通知が notifications テーブルに保存
- [ ] 異常検知が閾値超過時に burnout_warning を生成

---

## クリティカルファイル一覧

| ファイル                                     | 変更内容                                                                    | セッション |
| -------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| `src/core/types/plan.ts` → `entry.ts`        | Plan→Entry、origin等追加、status等削除                                      | 1.1        |
| `src/core/types/record.ts`                   | FulfillmentScore 1\|2\|3、RecordRow削除                                     | 1.1        |
| `src/lib/entry-status.ts`                    | **新規**: getEntryState(), isEntryPast()                                    | 1.1        |
| `supabase/migrations/`                       | entries統合マイグレーション                                                 | 1.1        |
| `src/server/services/plans/` → `entries/`    | EntryService（RecordService吸収）                                           | 1.2        |
| `src/server/api/routers/plans/` → `entries/` | ルーター統合                                                                | 1.2        |
| `src/server/services/records/`               | **削除**                                                                    | 1.2        |
| `src/server/api/routers/records/`            | **削除**                                                                    | 1.2        |
| `src/server/services/ai/context-service.ts`  | records→entries参照                                                         | 1.2        |
| `src/server/api/routers/plans/statsView.ts`  | 単一テーブルに簡素化                                                        | 1.2        |
| `src/server/services/reflections/`           | **新規**: reflection-service, data-aggregation, generation, prompt-template | 2.1-2.3    |
| `src/server/api/routers/reflections.ts`      | **新規**: reflectionsルーター                                               | 2.1        |
| `src/server/services/gamification/`          | **新規**: gamification-service, data-readiness-service                      | 2.2-2.3    |
| `supabase/functions/generate-reflections/`   | **新規**: Edge Function                                                     | 2.5        |
| `src/server/services/ai/anomaly-service.ts`  | **新規**: 異常検知                                                          | 2.7        |
