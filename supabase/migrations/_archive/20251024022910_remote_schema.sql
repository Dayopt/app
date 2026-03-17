revoke delete on table "public"."login_attempts" from "anon";

revoke insert on table "public"."login_attempts" from "anon";

revoke references on table "public"."login_attempts" from "anon";

revoke select on table "public"."login_attempts" from "anon";

revoke trigger on table "public"."login_attempts" from "anon";

revoke truncate on table "public"."login_attempts" from "anon";

revoke update on table "public"."login_attempts" from "anon";

revoke delete on table "public"."login_attempts" from "authenticated";

revoke insert on table "public"."login_attempts" from "authenticated";

revoke references on table "public"."login_attempts" from "authenticated";

revoke select on table "public"."login_attempts" from "authenticated";

revoke trigger on table "public"."login_attempts" from "authenticated";

revoke truncate on table "public"."login_attempts" from "authenticated";

revoke update on table "public"."login_attempts" from "authenticated";

revoke delete on table "public"."login_attempts" from "service_role";

revoke insert on table "public"."login_attempts" from "service_role";

revoke references on table "public"."login_attempts" from "service_role";

revoke select on table "public"."login_attempts" from "service_role";

revoke trigger on table "public"."login_attempts" from "service_role";

revoke truncate on table "public"."login_attempts" from "service_role";

revoke update on table "public"."login_attempts" from "service_role";

revoke delete on table "public"."tags" from "anon";

revoke insert on table "public"."tags" from "anon";

revoke references on table "public"."tags" from "anon";

revoke select on table "public"."tags" from "anon";

revoke trigger on table "public"."tags" from "anon";

revoke truncate on table "public"."tags" from "anon";

revoke update on table "public"."tags" from "anon";

revoke delete on table "public"."tags" from "authenticated";

revoke insert on table "public"."tags" from "authenticated";

revoke references on table "public"."tags" from "authenticated";

revoke select on table "public"."tags" from "authenticated";

revoke trigger on table "public"."tags" from "authenticated";

revoke truncate on table "public"."tags" from "authenticated";

revoke update on table "public"."tags" from "authenticated";

revoke delete on table "public"."tags" from "service_role";

revoke insert on table "public"."tags" from "service_role";

revoke references on table "public"."tags" from "service_role";

revoke select on table "public"."tags" from "service_role";

revoke trigger on table "public"."tags" from "service_role";

revoke truncate on table "public"."tags" from "service_role";

revoke update on table "public"."tags" from "service_role";

create table "public"."profiles" (
    "id" uuid not null,
    "email" text not null,
    "username" text,
    "full_name" text,
    "avatar_url" text,
    "bio" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."profiles" enable row level security;

CREATE UNIQUE INDEX email_unique ON public.profiles USING btree (email);

CREATE INDEX profiles_email_idx ON public.profiles USING btree (email);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE INDEX profiles_username_idx ON public.profiles USING btree (username);

CREATE UNIQUE INDEX username_unique ON public.profiles USING btree (username);

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."profiles" add constraint "email_unique" UNIQUE using index "email_unique";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "username_unique" UNIQUE using index "username_unique";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ensure_default_calendar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- ユーザーにデフォルトカレンダーがない場合、このカレンダーをデフォルトに設定
  IF NEW.is_default = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM calendars 
      WHERE user_id = NEW.user_id 
      AND is_default = true 
      AND id != NEW.id
    ) THEN
      NEW.is_default = true;
    END IF;
  ELSIF NEW.is_default = true THEN
    -- 他のカレンダーのデフォルトフラグを解除
    UPDATE calendars 
    SET is_default = false 
    WHERE user_id = NEW.user_id 
    AND id != NEW.id 
    AND is_default = true;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'full_name',        -- ← OAuthのフルネーム
    NEW.raw_user_meta_data->>'avatar_url',       -- ← OAuthのアバター画像
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_event_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  action_type TEXT;
  details JSONB = '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type = 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- 変更内容に応じてaction_typeを詳細設定
    IF OLD.planned_start IS DISTINCT FROM NEW.planned_start OR 
       OLD.planned_end IS DISTINCT FROM NEW.planned_end THEN
      action_type = 'time_changed';
      details = jsonb_build_object(
        'before', jsonb_build_object('start', OLD.planned_start, 'end', OLD.planned_end),
        'after', jsonb_build_object('start', NEW.planned_start, 'end', NEW.planned_end)
      );
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      action_type = 'status_changed';
      details = jsonb_build_object('before', OLD.status, 'after', NEW.status);
    ELSIF OLD.priority IS DISTINCT FROM NEW.priority THEN
      action_type = 'priority_changed';
      details = jsonb_build_object('before', OLD.priority, 'after', NEW.priority);
    ELSIF OLD.description IS DISTINCT FROM NEW.description THEN
      action_type = 'memo_updated';
    ELSIF OLD.items IS DISTINCT FROM NEW.items THEN
      action_type = 'checklist_updated';
    ELSE
      action_type = 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    action_type = 'deleted';
    details = row_to_json(OLD)::jsonb;
  END IF;
  
  -- 履歴レコード挿入
  IF TG_OP = 'DELETE' THEN
    INSERT INTO event_histories (event_id, action_type, details, created_by)
    VALUES (OLD.id, action_type, details, OLD.user_id);
    RETURN OLD;
  ELSE
    INSERT INTO event_histories (event_id, action_type, details, created_by)
    VALUES (NEW.id, action_type, details, NEW.user_id);
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_event_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- planned_startが設定されたらinbox→plannedへ
  IF NEW.planned_start IS NOT NULL AND OLD.status = 'inbox' THEN
    NEW.status = 'planned';
  END IF;
  
  -- planned_startが削除されたらplanned→inboxへ
  IF NEW.planned_start IS NULL AND OLD.status = 'planned' THEN
    NEW.status = 'inbox';
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_and_check_tag_depth()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  calculated_depth smallint;
begin
  -- parent_id が NULL の場合は depth = 1（ルートタグ）
  if new.parent_id is null then
    new.depth := 1;
  else
    -- 親タグの depth + 1 を計算
    select coalesce(depth, 1) + 1 into calculated_depth
    from tags
    where id = new.parent_id;

    new.depth := calculated_depth;
  end if;

  -- depth が 4 以上の場合はエラー
  if (new.depth >= 4) then
    raise exception 'Tag depth cannot be 4 or greater';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    DELETE FROM public.login_attempts
    WHERE attempt_time < NOW() - INTERVAL '90 days';
END;
$function$
;

create policy "Public profiles are viewable by everyone"
on "public"."profiles"
as permissive
for select
to public
using (true);


create policy "Users can delete own profile"
on "public"."profiles"
as permissive
for delete
to authenticated
using ((auth.uid() = id));


create policy "Users can insert own profile"
on "public"."profiles"
as permissive
for insert
to authenticated
with check ((auth.uid() = id));


create policy "Users can update own profile"
on "public"."profiles"
as permissive
for update
to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));


CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


  create policy "Users can delete their own avatar"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update their own avatar"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload their own avatar"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can view their own avatar"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



