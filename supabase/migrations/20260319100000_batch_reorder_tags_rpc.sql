-- batch_reorder_tags: タグの sort_order を1クエリでバッチ更新する RPC
-- N回の個別UPDATE → 1回のCASE/WHEN UPDATEに最適化

create or replace function batch_reorder_tags(
  p_user_id uuid,
  p_tag_ids uuid[],
  p_sort_orders int[]
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

  -- 配列長の一致を検証
  if array_length(p_tag_ids, 1) is distinct from array_length(p_sort_orders, 1) then
    raise exception 'tag_ids and sort_orders must have the same length';
  end if;

  -- CASE/WHEN で一括更新（所有権チェック付き）
  update public.tags
  set sort_order = batch.new_order,
      updated_at = now()
  from unnest(p_tag_ids, p_sort_orders) as batch(tag_id, new_order)
  where public.tags.id = batch.tag_id
    and public.tags.user_id = p_user_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
