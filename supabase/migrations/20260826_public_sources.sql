-- 第2段階：公開情報seed用のカラム・制約・RLS（既存DB向け）
-- 先に 20260826_01_add_public_source_enum.sql を別クエリとして実行してください。
-- その実行完了後、このファイルを実行します。

alter table public.places add column if not exists public_data_key text;
alter table public.posts add column if not exists source_name text;
alter table public.posts add column if not exists source_url text;
alter table public.posts add column if not exists source_retrieved_at date;
alter table public.posts add column if not exists public_data_key text;

create unique index if not exists places_public_data_key_uidx on public.places(public_data_key) where public_data_key is not null;
create unique index if not exists posts_public_data_key_uidx on public.posts(public_data_key) where public_data_key is not null;

alter table public.posts drop constraint if exists posts_public_source_attribution_check;
alter table public.posts add constraint posts_public_source_attribution_check check (
  source_type <> 'public_source' or (
    user_id is null and source_name is not null and source_url is not null and
    source_retrieved_at is not null and public_data_key is not null
  )
);

-- 一般利用者が公的情報を名乗ったり、出典管理列を書き込んだりすることを防ぎます。
drop policy if exists "anonymous users create posts" on public.posts;
create policy "anonymous users create posts" on public.posts for insert to anon with check (
  user_id is null and status = 'published' and source_type <> 'public_source' and
  source_name is null and source_url is null and source_retrieved_at is null and public_data_key is null
);
drop policy if exists "authenticated users create own posts" on public.posts;
create policy "authenticated users create own posts" on public.posts for insert to authenticated with check (
  user_id = auth.uid() and status in ('published','pending') and source_type <> 'public_source' and
  source_name is null and source_url is null and source_retrieved_at is null and public_data_key is null
);

create or replace function public.create_place_with_post(
  p_latitude double precision, p_longitude double precision, p_name text, p_address text, p_category text, p_content text,
  p_occurred_at date, p_occurred_period public.occurred_period, p_source_type public.source_type
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_place_id uuid;
begin
  if p_source_type = 'public_source' then raise exception 'public_source is reserved for managed seed data'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'invalid coordinates'; end if;
  if char_length(p_content) not between 15 and 500 then raise exception 'invalid content length'; end if;
  insert into public.places(latitude,longitude,name,address) values(p_latitude,p_longitude,nullif(trim(p_name),''),nullif(trim(p_address),'')) returning id into new_place_id;
  insert into public.posts(place_id,category,content,occurred_at,occurred_period,source_type,user_id,status) values(new_place_id,p_category,p_content,p_occurred_at,p_occurred_period,p_source_type,auth.uid(),'published');
  return new_place_id;
end; $$;

revoke all on function public.create_place_with_post(double precision,double precision,text,text,text,text,date,public.occurred_period,public.source_type) from public;
grant execute on function public.create_place_with_post(double precision,double precision,text,text,text,text,date,public.occurred_period,public.source_type) to anon, authenticated;
