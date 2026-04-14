-- entries統合時に作成されたバックアップテーブルを削除
-- アーカイブ済みマイグレーション（20260317000001）が未適用のため再作成

DROP TABLE IF EXISTS _backup_records;
DROP TABLE IF EXISTS _backup_record_tags;
DROP TABLE IF EXISTS _backup_record_activities;
