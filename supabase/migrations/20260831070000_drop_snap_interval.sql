-- user_settings から snap_interval を削除
-- #2496 でカレンダーの時間刻みを 1 分固定にしたため、snap 間隔を選ばせる
-- 前提の設定が不要になった。UI は元から存在せず、#2513 でアプリ層の読み書きを
-- 全て撤去済み（supabase skill の destructive change 3 段階のうち step 3）。
--
-- CHECK 制約 user_settings_snap_interval_check はこの列のみを参照するため
-- DROP COLUMN で連鎖的に削除される。

ALTER TABLE user_settings DROP COLUMN snap_interval;
