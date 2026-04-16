-- profiles.full_name → auth.users.raw_user_meta_data.full_name のバックフィル
-- 対象: auth metadata に full_name がないか空で、profiles.full_name が存在するユーザー
UPDATE auth.users au
SET raw_user_meta_data =
  CASE
    WHEN au.raw_user_meta_data IS NULL
    THEN jsonb_build_object('full_name', p.full_name)
    ELSE au.raw_user_meta_data || jsonb_build_object('full_name', p.full_name)
  END
FROM public.profiles p
WHERE au.id = p.id
  AND p.full_name IS NOT NULL
  AND p.full_name != ''
  AND (
    au.raw_user_meta_data IS NULL
    OR au.raw_user_meta_data ->> 'full_name' IS NULL
    OR au.raw_user_meta_data ->> 'full_name' = ''
  );
