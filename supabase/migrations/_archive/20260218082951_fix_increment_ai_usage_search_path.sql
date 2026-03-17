-- increment_ai_usage: SECURITY DEFINERにsearch_pathを固定
-- search_path未固定のSECURITY DEFINER関数はスキーマ注入攻撃のリスクがある
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.ai_usage (user_id, month, request_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    request_count = ai_usage.request_count + 1,
    updated_at = now();
END;
$function$;
