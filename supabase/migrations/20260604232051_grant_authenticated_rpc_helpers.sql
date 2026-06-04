-- Keep helper functions callable by browser-authenticated RPCs after the
-- security hardening migration revokes function EXECUTE by default.
DO $$
DECLARE
  fn text;
  target regprocedure;
  authenticated_helper_functions text[] := ARRAY[
    'public.get_user_timezone(uuid)',
    'public.trunc_week_tz(timestamp with time zone,text,integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY authenticated_helper_functions LOOP
    target := to_regprocedure(fn);
    IF target IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', target);
    END IF;
  END LOOP;
END $$;
