-- 20260414200000 で profiles.username を削除したが、
-- handle_new_user() トリガー関数が username への INSERT を続けていたため
-- 新規ユーザー作成時に SQLSTATE 42703 が発生していた。
-- username 関連ロジックを除去した版に置き換える。

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$$;
