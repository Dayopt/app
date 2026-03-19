-- Custom Access Token Hook: JWTにsubscription_statusを埋め込む
-- 目的: proProcedureでの毎リクエストDBクエリを排除（月72万クエリ削減）
-- JWTリフレッシュ時（1時間ごと）にのみDBを参照し、以降はJWTクレームから読み取る

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  user_subscription_status text;
BEGIN
  claims := event->'claims';

  SELECT p.subscription_status INTO user_subscription_status
  FROM public.profiles p
  WHERE p.id = (claims->>'sub')::uuid;

  -- subscription_status をJWTクレームに追加（未登録ユーザーは 'free'）
  claims := jsonb_set(
    claims,
    '{subscription_status}',
    to_jsonb(COALESCE(user_subscription_status, 'free'))
  );

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- supabase_auth_admin のみ実行可能（Auth内部から呼ばれる）
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
