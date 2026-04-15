-- user_settings から plan_record_mode と AI関連カラムを削除
-- plan_record_mode: 計画/記録の区分はエントリモデルから削除済みで存在意義なし
-- AI関連: PMF前に不要、将来必要なら再設計

ALTER TABLE user_settings DROP COLUMN plan_record_mode;
ALTER TABLE user_settings DROP COLUMN ai_communication_style;
ALTER TABLE user_settings DROP COLUMN ai_custom_style_prompt;
ALTER TABLE user_settings DROP COLUMN personalization_values;
ALTER TABLE user_settings DROP COLUMN personalization_ranked_values;
