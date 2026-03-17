-- 通知テーブル拡張: AI通知タイプ + data JSONB + reflection_id FK
-- Session 2.5: 振り返り自動生成 + バーンアウト警告の通知基盤

-- 1. type制約を拡張（AI通知タイプ追加）
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'reminder',        -- 既存: 事前リマインダー
    'overdue',         -- 既存: 期限超過
    'ai_insight',      -- AI洞察通知
    'weekly_report',   -- 週次振り返りレポート生成完了
    'burnout_warning', -- バーンアウト警告
    'energy_insight'   -- エネルギーパターン洞察
  ));

-- 2. data JSONB カラム追加（通知の追加データ格納）
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- 3. reflection_id FK 追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reflection_id UUID
  REFERENCES reflections(id) ON DELETE SET NULL;

-- 4. インデックス
CREATE INDEX IF NOT EXISTS idx_notifications_reflection_id
  ON notifications(reflection_id)
  WHERE reflection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(type);

-- 5. コメント更新
COMMENT ON TABLE notifications IS '通知テーブル - リマインダー + AI通知';
COMMENT ON COLUMN notifications.type IS '通知タイプ: reminder | overdue | ai_insight | weekly_report | burnout_warning | energy_insight';
COMMENT ON COLUMN notifications.data IS 'AI通知の追加データ (JSONB)';
COMMENT ON COLUMN notifications.reflection_id IS '関連する振り返りレポートID';
