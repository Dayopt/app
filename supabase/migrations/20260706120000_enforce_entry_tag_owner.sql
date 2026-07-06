-- entries.tag_id が設定される場合、entry と tag の user_id 一致を DB でも強制する。
-- アプリ層の owner check に加え、service-role や将来の RPC 経路からの書き込みでも
-- foreign tag を entries に保持できないようにする。

CREATE OR REPLACE FUNCTION public.enforce_entry_tag_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.tag_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = NEW.tag_id
      AND tags.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'entries.tag_id must reference a tag owned by the entry user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_entry_tag_owner ON public.entries;

CREATE CONSTRAINT TRIGGER enforce_entry_tag_owner
AFTER INSERT OR UPDATE OF user_id, tag_id ON public.entries
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_entry_tag_owner();
