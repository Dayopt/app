create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text default '#3b82f6',      -- Tailwind blue-500 を初期値に
  parent_id uuid references tags(id) on delete cascade,
  depth smallint default 1,           -- トリガーで自動計算
  created_at timestamptz default now()
);
create index on tags(parent_id);

-- Enable Row Level Security
alter table tags enable row level security;

create policy "individual_access" on tags for all to authenticated using (true);

-- Supabase function で depth を計算し、≥ 4 の挿入／更新を拒否する（raise exception）。
create or replace function calculate_and_check_tag_depth()
returns trigger as $$
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
$$ language plpgsql;

create trigger tags_depth_auto_calculate
  before insert or update on tags
  for each row execute procedure calculate_and_check_tag_depth();