-- auto_shrink_neighbors: 隣接エントリの記録時間を1クエリでバッチ調整する RPC
-- N回の個別UPDATE → 1回の検索+更新に最適化（月36万→6万クエリ削減）
--
-- ロジック:
--   自分のactual時間範囲と重複する隣接エントリを±24時間内で検索し、
--   左隣の actual_end_time を引き戻し、右隣の actual_start_time を押し出す。

create or replace function auto_shrink_neighbors(
  p_user_id uuid,
  p_entry_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz
)
returns setof public.entries
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 呼び出し元の認証チェック（SECURITY DEFINER の防御層）
  if p_user_id is distinct from auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  -- NULL チェック（開始・終了が揃っていない場合は何もしない）
  if p_actual_start is null or p_actual_end is null then
    return;
  end if;

  -- 左隣: 自分より前に始まり、終了が自分の開始に食い込む → actual_end_time を引き戻す
  -- 右隣: 自分の範囲内に始まり、自分より後に終わる → actual_start_time を押し出す
  -- 1クエリで両方を処理する
  return query
  with neighbors as (
    select
      e.id,
      -- 実効的な開始・終了時間（actual があればそちらを使用）
      coalesce(e.actual_start_time, e.start_time) as eff_start,
      coalesce(e.actual_end_time, e.end_time) as eff_end
    from public.entries e
    where e.user_id = p_user_id
      and e.id != p_entry_id
      and e.start_time is not null
      and e.start_time >= p_actual_start - interval '24 hours'
      and e.start_time <= p_actual_end + interval '24 hours'
  ),
  adjustments as (
    select
      n.id,
      -- 左隣: eff_start < my_start AND eff_end > my_start AND eff_end <= my_end
      case
        when n.eff_start < p_actual_start
         and n.eff_end > p_actual_start
         and n.eff_end <= p_actual_end
        then p_actual_start
        else null
      end as new_actual_end,
      -- 右隣: eff_start >= my_start AND eff_start < my_end AND eff_end > my_end
      case
        when n.eff_start >= p_actual_start
         and n.eff_start < p_actual_end
         and n.eff_end > p_actual_end
        then p_actual_end
        else null
      end as new_actual_start
    from neighbors n
    where
      -- 左隣条件
      (n.eff_start < p_actual_start and n.eff_end > p_actual_start and n.eff_end <= p_actual_end)
      or
      -- 右隣条件
      (n.eff_start >= p_actual_start and n.eff_start < p_actual_end and n.eff_end > p_actual_end)
  )
  update public.entries e
  set
    actual_end_time = coalesce(a.new_actual_end, e.actual_end_time),
    actual_start_time = coalesce(a.new_actual_start, e.actual_start_time),
    updated_at = now()
  from adjustments a
  where e.id = a.id
    and e.user_id = p_user_id
  returning e.*;
end;
$$;
