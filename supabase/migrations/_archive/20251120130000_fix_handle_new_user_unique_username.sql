-- ========================================
-- fix_handle_new_user_unique_username.sql
-- 作成日: 2025-11-20
-- 目的: handle_new_user() 関数を修正し、username の UNIQUE 制約違反を防ぐ
-- ========================================

-- 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 関数を作成/更新
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  base_username TEXT;
  final_username TEXT;
  username_counter INT := 0;
BEGIN
  RAISE LOG 'handle_new_user: Starting for user % (%)', NEW.id, NEW.email;

  -- ベースのユーザー名を生成
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- ユーザー名の重複チェックとユニーク化
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    username_counter := username_counter + 1;
    final_username := base_username || username_counter::TEXT;
  END LOOP;

  RAISE LOG 'handle_new_user: Inserting profile with username %', final_username;

  -- プロフィールを挿入（ON CONFLICT で重複を防ぐ）
  INSERT INTO public.profiles (id, email, username, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    final_username,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE LOG 'handle_new_user: Successfully created profile for %', NEW.email;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: ERROR - % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    -- エラーが発生してもユーザー作成は継続させる（トランザクションをロールバックしない）
    RETURN NEW;
END;
$function$;

-- トリガーを再作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
