-- まちこえ MVP initial schema
-- 新規または空のSupabaseプロジェクトの SQL Editor で1回実行してください。
create extension if not exists pgcrypto;

do $$ begin create type public.occurred_period as enum ('today','recent','this_month','date','unknown'); exception when duplicate_object then null; end $$;
do $$ begin create type public.source_type as enum ('firsthand','observed','resident_experience','heard_from_others','other','public_source'); exception when duplicate_object then null; end $$;
do $$ begin create type public.post_status as enum ('published','pending','hidden'); exception when duplicate_object then null; end $$;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(), latitude double precision not null check (latitude between -90 and 90), longitude double precision not null check (longitude between -180 and 180), name text, address text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), place_id uuid not null references public.places(id) on delete cascade, category text not null, content text not null check (char_length(content) between 15 and 500),
  occurred_at date, occurred_period public.occurred_period not null default 'unknown', source_type public.source_type not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), status public.post_status not null default 'published', report_count integer not null default 0 check (report_count >= 0),
  user_id uuid references auth.users(id) on delete set null, image_urls text[] not null default '{}', moderation_result jsonb,
  source_name text, source_url text, source_retrieved_at date, public_data_key text,
  constraint occurred_date_consistency check ((occurred_period = 'date' and occurred_at is not null) or (occurred_period <> 'date' and occurred_at is null)),
  constraint posts_public_source_attribution_check check (source_type <> 'public_source' or (user_id is null and source_name is not null and source_url is not null and source_retrieved_at is not null and public_data_key is not null))
);
alter table public.places add column if not exists public_data_key text;
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, reporter_id uuid references auth.users(id) on delete set null, reason text not null, created_at timestamptz not null default now()
);

-- MVP向け通常index。将来はPostGIS geography(Point,4326)列とGIST indexを追加できます。
create index if not exists places_latitude_longitude_idx on public.places(latitude, longitude);
create index if not exists posts_place_created_idx on public.posts(place_id, created_at desc);
create index if not exists posts_public_map_idx on public.posts(status, created_at desc);
create index if not exists reports_post_idx on public.reports(post_id);
create unique index if not exists places_public_data_key_uidx on public.places(public_data_key) where public_data_key is not null;
create unique index if not exists posts_public_data_key_uidx on public.posts(public_data_key) where public_data_key is not null;

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public, pg_temp as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at before update on public.places for each row execute function public.set_updated_at();
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts for each row execute function public.set_updated_at();

alter table public.places enable row level security;
alter table public.posts enable row level security;
alter table public.reports enable row level security;
grant usage on schema public to anon, authenticated;
grant select on table public.places to anon, authenticated;
grant select, insert on table public.posts to anon, authenticated;
grant insert on table public.reports to anon, authenticated;
drop policy if exists "places readable by everyone" on public.places;
create policy "places readable by everyone" on public.places for select to anon, authenticated using (true);
drop policy if exists "published posts readable by everyone" on public.posts;
create policy "published posts readable by everyone" on public.posts for select to anon, authenticated using (status = 'published');
-- ログイン導入時は次のanon policyを削除し、authenticated policyだけにします。
drop policy if exists "anonymous users create posts" on public.posts;
create policy "anonymous users create posts" on public.posts for insert to anon with check (user_id is null and status = 'published' and source_type <> 'public_source' and source_name is null and source_url is null and source_retrieved_at is null and public_data_key is null);
drop policy if exists "authenticated users create own posts" on public.posts;
create policy "authenticated users create own posts" on public.posts for insert to authenticated with check (user_id = auth.uid() and status in ('published','pending') and source_type <> 'public_source' and source_name is null and source_url is null and source_retrieved_at is null and public_data_key is null);

-- 新規地点と最初の投稿を同じDB transaction内で作成します。
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

create or replace function public.report_post(p_post_id uuid, p_reason text default 'other') returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.posts where id=p_post_id and status='published') then raise exception 'post not found'; end if;
  insert into public.reports(post_id,reporter_id,reason) values(p_post_id,auth.uid(),left(coalesce(p_reason,'other'),100));
  update public.posts set report_count=report_count+1 where id=p_post_id;
end; $$;

revoke all on function public.create_place_with_post(double precision,double precision,text,text,text,text,date,public.occurred_period,public.source_type) from public;
grant execute on function public.create_place_with_post(double precision,double precision,text,text,text,text,date,public.occurred_period,public.source_type) to anon, authenticated;
revoke all on function public.report_post(uuid,text) from public;
grant execute on function public.report_post(uuid,text) to anon, authenticated;

-- 写真は次工程で接続。バケットと制限だけ先に準備します。
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-images','post-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
