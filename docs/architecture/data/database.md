# Database Architecture

> **テーブル数**: 11 | **PostgreSQL**: v17

DayoptはSupabase（PostgreSQL）を使用し、3環境（Local / Staging / Production）で運用。
全テーブルにRow Level Security (RLS) を適用し、マルチテナントのデータ分離を実現。

---

## テーブル一覧

### コアビジネス（3テーブル）

| テーブル       | 役割                                         | 主要カラム                                                                                                                              |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **entries**    | 時間ブロック（計画・実績の統合エンティティ） | title, origin(planned), start*time, end_time, actual_start_time, actual_end_time, fulfillment_score(1-5), duration_minutes, reminder*\* |
| **tags**       | 階層タグ（親子1階層）                        | name, color, parent_id, level, sort_order, is_active                                                                                    |
| **entry_tags** | Entries↔Tags中間テーブル                     | entry_id, tag_id                                                                                                                        |

### ユーザー設定（3テーブル）

| テーブル                     | 役割                                    | 主要カラム                                                                  |
| ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| **profiles**                 | ユーザープロフィール（auth.usersと1:1） | email, username, full_name, avatar_url                                      |
| **user_settings**            | 表示設定                                | timezone, theme, time*format, chronotype*_, snap*interval, business_hours*_ |
| **notification_preferences** | 通知設定                                | enable_browser/email/push_notifications, default_reminder_enabled           |

### 通知（1テーブル）

| テーブル          | 役割         | 主要カラム                                        |
| ----------------- | ------------ | ------------------------------------------------- |
| **notifications** | ユーザー通知 | type, priority, title, message, is_read, entry_id |

### セキュリティ/監査（1テーブル）

| テーブル               | 役割                | 主要カラム                  |
| ---------------------- | ------------------- | --------------------------- |
| **mfa_recovery_codes** | MFAリカバリーコード | code_hash(SHA-256), used_at |

---

## ER図

```
                          ┌──────────────────┐
                          │    auth.users     │
                          │  (Supabase管理)   │
                          │──────────────────│
                          │ id (PK, UUID)     │
                          │ email             │
                          └────────┬─────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    profiles       │  │  user_settings    │  │  notification_   │
│    (1:1)          │  │    (1:1)          │  │  preferences     │
│──────────────────│  │──────────────────│  │    (1:1)          │
│ id (PK=FK)        │  │ user_id (FK,UQ)   │  │──────────────────│
│ email, username   │  │ timezone, theme   │  │ user_id (FK,UQ)  │
└──────────────────┘  └──────────────────┘  └──────────────────┘


         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│     entries       │  │       tags        │  │  notifications   │
│──────────────────│  │──────────────────│  │──────────────────│
│ id (PK)           │  │ id (PK)           │  │ id (PK)          │
│ user_id (FK)      │  │ user_id (FK)      │  │ user_id (FK)     │
│ title, origin     │  │ name, color       │  │ type, title      │
│ start/end_time    │  │ parent_id (FK→    │  │ entry_id (FK)    │
│ actual_start/     │  │   self, max 1階層) │  │ is_read          │
│   end_time        │  └───────┬──────────┘  └──────────────────┘
│ fulfillment_score │          │
│ duration_minutes  │     ┌────┘
│ reminder_*        │     │
└───────┬──────────┘      ▼
        │          ┌──────────────────┐
        └──────────│   entry_tags     │
                   │──────────────────│
                   │ entry_id (FK)    │
                   │ tag_id  (FK)     │
                   │ UNIQUE(entry,tag) │
                   └──────────────────┘

=== セキュリティ/監査 ===

┌──────────────────┐
│ mfa_recovery_    │
│ codes            │
│──────────────────│
│ user_id (FK)     │
│ code_hash        │
│ used_at           │
└──────────────────┘
```

---

## 設計判断

### UUID主キー

全テーブルで `gen_random_uuid()` を使用。分散環境でのマージ安全性、URL推測困難性を確保。

### RLSパターン

```sql
-- 基本パターン: ユーザーは自分のデータのみアクセス可能
(select auth.uid()) = user_id

-- 関連テーブル: 親テーブルの所有権で判定
EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id
        AND entries.user_id = (select auth.uid()))
```

### Entries の統合設計（ADR-001）

`plans` テーブルと `records` テーブルを単一の `entries` テーブルに統合。`status` カラムは廃止し、エントリの状態は時間位置から自動導出する：

- `start_time > now` → `upcoming`
- `start_time <= now < end_time` → `active`
- `end_time <= now` → `past`

`actual_start_time` / `actual_end_time` は過去ブロックの実績記録に使用。`fulfillment_score`（1-5）はnullableカラムとして全エントリに存在するが、過去ブロックのみに意味を持つ。詳細は ADR-001 参照。

### Tags の階層制限

`level < 2` で親子1階層に制限。トリガーで `level`, `path`, `depth` を自動計算。深い階層は複雑性を増すだけと判断。

### トランザクション関数

複数テーブルを跨ぐ操作はDB関数で原子性を保証:

- `soft_delete_entry()` — エントリのソフトデリート（deleted_at セット）
- `bulk_soft_delete_entries()` — 複数エントリの一括ソフトデリート
- `restore_entry()` — ソフトデリートしたエントリの復元
- `merge_tags()` — タグマージ + 子タグの昇格

---

## 定期クリーンアップ（pg_cron）

| ジョブ                  | スケジュール   | 保持期間         | 対象テーブル  |
| ----------------------- | -------------- | ---------------- | ------------- |
| `cleanup-notifications` | 毎日 03:20 UTC | 30日（既読のみ） | notifications |

---

## インデックス監査ランブック

本番DBで定期的に実行し、未使用インデックスを特定する。

### 未使用インデックスの検出

```sql
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 重複インデックスの検出

```sql
SELECT
  a.indexrelid::regclass AS index_a,
  b.indexrelid::regclass AS index_b,
  a.indrelid::regclass AS table_name
FROM pg_index a
JOIN pg_index b ON a.indrelid = b.indrelid
  AND a.indexrelid < b.indexrelid
WHERE a.indkey[0] = b.indkey[0]
  AND a.indrelid::regclass::text NOT LIKE 'pg_%';
```

> **注意**: インデックスの削除は、本番で2-4週間のデータ蓄積後に実施すること。
