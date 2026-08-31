-- user_settings から snap_interval を削除
-- #2496 でカレンダーの時間刻みを 1 分固定にしたため、snap 間隔を選ばせる
-- 前提の設定が不要になった。UI は元から存在せず、#2513 でアプリ層の読み書きを
-- 全て撤去済み（supabase skill の destructive change 3 段階のうち step 3）。
--
-- CHECK 制約 user_settings_snap_interval_check はこの列のみを参照するため
-- DROP COLUMN で連鎖的に削除される。
--
-- IF EXISTS: 列が既に無い環境（branch 再生成の途中状態など）へ当てても
-- 落ちないようにする。落ちるとその環境の以降の migration が全て止まるため。
--
-- ⚠️ rollback 下限: この migration の適用後は、#2513（efc944f）より前の
-- ビルドへ戻してはならない。旧 publicUserSettingsSelect が snap_interval を
-- 明示列挙しているため、settings の get / upsert が全ユーザーで PostgREST 400
-- になる。DB は forward-only なのでコード revert では復旧しない。

ALTER TABLE user_settings DROP COLUMN IF EXISTS snap_interval;
