-- rename_tag_group: グループ（コロン記法プレフィックス）の一括リネーム
-- N回の個別UPDATE → 1回のUPDATEに最適化

create or replace function rename_tag_group(
  p_user_id uuid,
  p_old_prefix text,
  p_new_prefix text
)
returns setof public.tags
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 呼び出し元の認証チェック（SECURITY DEFINER の防御層）
  if p_user_id is distinct from auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  return query
  update public.tags
  set name = p_new_prefix || substring(name from length(p_old_prefix) + 1),
      updated_at = now()
  where user_id = p_user_id
    and starts_with(name, p_old_prefix || ':')
  returning *;
end;
$$;

-- batch_rename_tags: タグIDリストに対して新しい名前を一括設定
-- ungroupTags の非衝突タグリネームに使用

create or replace function batch_rename_tags(
  p_user_id uuid,
  p_tag_ids uuid[],
  p_new_names text[]
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count int;
begin
  -- 呼び出し元の認証チェック（SECURITY DEFINER の防御層）
  if p_user_id is distinct from auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  if array_length(p_tag_ids, 1) is distinct from array_length(p_new_names, 1) then
    raise exception 'tag_ids and new_names must have the same length';
  end if;

  update public.tags
  set name = batch.new_name,
      updated_at = now()
  from unnest(p_tag_ids, p_new_names) as batch(tag_id, new_name)
  where public.tags.id = batch.tag_id
    and public.tags.user_id = p_user_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
