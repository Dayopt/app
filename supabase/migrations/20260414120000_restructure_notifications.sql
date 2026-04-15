-- notifications テーブル構造変更
-- - title (text, NOT NULL) 追加
-- - fire_at (timestamptz, nullable) 追加
-- - reflection_id を data jsonb に吸収して削除
-- - is_read を read_at に統合して削除（null=未読）

-- 1. 新カラム追加（title は一時的に nullable でバックフィル後に NOT NULL 化）
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS fire_at TIMESTAMPTZ;

-- 2. title バックフィル: entries.title → type フォールバック
UPDATE public.notifications n
SET title = COALESCE(
  (SELECT e.title FROM public.entries e WHERE e.id = n.entry_id),
  n.type
);

-- 3. title を NOT NULL に変更
ALTER TABLE public.notifications ALTER COLUMN title SET NOT NULL;

-- 4. reflection_id → data jsonb に吸収
UPDATE public.notifications
SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('reflection_id', reflection_id)
WHERE reflection_id IS NOT NULL;

-- 5. is_read=true かつ read_at IS NULL の安全バックフィル
UPDATE public.notifications
SET read_at = created_at
WHERE is_read = true AND read_at IS NULL;

-- 6. is_read カラム削除（インデックスも先に削除）
DROP INDEX IF EXISTS idx_notifications_user_unread;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS is_read;

-- 7. reflection_id カラム削除（FK → インデックス → カラム）
DROP INDEX IF EXISTS idx_notifications_reflection_id;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_reflection_id_fkey;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS reflection_id;

-- 8. 未読用の部分インデックス再作成（read_at IS NULL = 未読）
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE read_at IS NULL;

-- 9. delete_old_notifications() を read_at ベースに更新
CREATE OR REPLACE FUNCTION public.delete_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE read_at IS NOT NULL AND created_at < now() - interval '30 days';
END;
$$;
