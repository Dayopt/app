-- entry_activities テーブルを削除
-- 理由: アプリからINSERTが一切なく、UIで変更履歴を表示する予定もない空テーブル
-- 監査が必要になれば pg_audit 拡張で後付け可能

-- cronジョブ削除
SELECT cron.unschedule('cleanup-plan-activities');

-- クリーンアップ関数削除
DROP FUNCTION IF EXISTS public.cleanup_old_plan_activities();

-- テーブル削除（RLS・ポリシー・インデックスはDROP TABLEで自動削除）
DROP TABLE IF EXISTS public.entry_activities;
