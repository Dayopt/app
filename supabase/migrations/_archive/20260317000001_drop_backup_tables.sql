-- entries統合時に作成されたバックアップテーブルを削除
-- 元マイグレーション: 20260301000000_unify_plans_records_to_entries.sql
-- RLS未適用テーブルが本番に残存するリスクを排除

DROP TABLE IF EXISTS _backup_records;
DROP TABLE IF EXISTS _backup_record_tags;
DROP TABLE IF EXISTS _backup_record_activities;
