-- ========================================
-- Session関連テーブル・機能の削除
-- 作成日: 2024-10-30
-- 理由: plan/Session統合の複雑さを解消、必要時に再実装
-- ========================================

-- ========================================
-- 1. トリガーの削除
-- ========================================
DROP TRIGGER IF EXISTS trigger_generate_session_number ON sessions;
DROP TRIGGER IF EXISTS trigger_update_plan_hours_on_session_change ON sessions;
DROP TRIGGER IF EXISTS trigger_calculate_session_duration ON sessions;
DROP TRIGGER IF EXISTS trigger_update_sessions_updated_at ON sessions;
DROP TRIGGER IF EXISTS trigger_update_records_updated_at ON records;

-- ========================================
-- 2. 関数の削除
-- ========================================
DROP FUNCTION IF EXISTS generate_session_number();
DROP FUNCTION IF EXISTS update_plan_actual_hours();
DROP FUNCTION IF EXISTS calculate_session_duration();

-- ========================================
-- 3. テーブルの削除（依存関係順）
-- ========================================
-- Records（session_idに依存）
DROP TABLE IF EXISTS records CASCADE;

-- Session Tags（session_idに依存）
DROP TABLE IF EXISTS session_tags CASCADE;

-- Sessions（メインテーブル）
DROP TABLE IF EXISTS sessions CASCADE;

-- ========================================
-- 4. plansテーブルのactual_hoursカラム削除
-- ========================================
-- セッションベースの実績時間集計が不要になったため
ALTER TABLE plans DROP COLUMN IF EXISTS actual_hours;

-- ========================================
-- 注記
-- ========================================
-- このマイグレーションは以下を削除します:
-- - sessions テーブル
-- - records テーブル（session_idに依存）
-- - session_tags テーブル
-- - Session関連の関数・トリガー
-- - plansのactual_hoursカラム
--
-- 残るもの:
-- - plans テーブル
-- - tags テーブル
-- - plan_tags テーブル
