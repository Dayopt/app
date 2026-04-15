-- tags テーブルに updated_at 自動更新トリガーを追加
-- 他テーブル(entries, profiles, user_settings)には既に設定済みだが tags のみ欠落していた
CREATE TRIGGER trigger_update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
