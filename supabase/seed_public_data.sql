-- まちこえ：飯田市公的情報seed（2026-08-26調査）
-- 実行前に、次のmigrationを別々のRunで適用してください。
-- 1. migrations/20260826_01_add_public_source_enum.sql
-- 2. migrations/20260826_public_sources.sql
-- このファイル自体は、下記の単一SQL文を1回Runするだけで完了します。

with seed_places as (
  select * from (values
    ('iida-public-place-central-library'::text,'飯田市立中央図書館'::text,'長野県飯田市追手町2丁目677番地3'::text,35.5132069::double precision,137.8296314::double precision),
    ('iida-public-place-city-hall'::text,'飯田市役所'::text,'長野県飯田市大久保町2534番地'::text,35.5148591::double precision,137.8215335::double precision),
    ('iida-public-place-kamihisakata-community-center'::text,'上久堅公民館'::text,'長野県飯田市上久堅3769'::text,35.4608741::double precision,137.8824510::double precision),
    ('iida-public-place-iida-station'::text,'飯田駅'::text,null::text,35.5187725::double precision,137.8207373::double precision)
  ) as v(public_data_key,name,address,latitude,longitude)
),
existing_places as (
  select s.public_data_key,matched.id as place_id
  from seed_places s
  cross join lateral (
    select p.id
    from public.places p
    where p.public_data_key=s.public_data_key
       or lower(trim(coalesce(p.name,'')))=lower(trim(s.name))
       or (abs(p.latitude-s.latitude)<0.00018 and abs(p.longitude-s.longitude)<0.00022)
    order by
      (p.public_data_key=s.public_data_key) desc,
      (lower(trim(coalesce(p.name,'')))=lower(trim(s.name))) desc,
      p.created_at asc
    limit 1
  ) matched
),
inserted_places as (
  insert into public.places(name,address,latitude,longitude,public_data_key)
  select s.name,s.address,s.latitude,s.longitude,s.public_data_key
  from seed_places s
  where not exists (
    select 1 from existing_places e where e.public_data_key=s.public_data_key
  )
  on conflict (public_data_key) where public_data_key is not null do nothing
  returning public_data_key,id as place_id
),
place_map as (
  select public_data_key,place_id from existing_places
  union all
  select public_data_key,place_id from inserted_places
),
tagged_existing_places as (
  update public.places p
  set public_data_key=m.public_data_key
  from place_map m
  where p.id=m.place_id
    and p.public_data_key is null
  returning p.id
),
seed_posts as (
  select * from (values
    ('iida-public-post-central-library'::text,'iida-public-place-central-library'::text,'店舗・施設'::text,'飯田市公式情報をもとにした公開情報です。飯田市立中央図書館では、蔵書の貸し出し・返却受付や各種催事を行っています。最新の開館情報は出典ページで確認してください。'::text,'飯田市「中央図書館」'::text,'https://www.city.iida.lg.jp/soshiki/42/'::text),
    ('iida-public-post-city-hall'::text,'iida-public-place-city-hall'::text,'店舗・施設'::text,'飯田市公式情報をもとにした公開情報です。飯田市役所本庁舎の所在地や窓口案内は、飯田市公式の庁舎案内で確認できます。来庁前に最新情報を確認してください。'::text,'飯田市「飯田市役所のご案内」'::text,'https://www.city.iida.lg.jp/soshiki/8/cityhallguide.html'::text),
    ('iida-public-post-kamihisakata-community-center'::text,'iida-public-place-kamihisakata-community-center'::text,'店舗・施設'::text,'飯田市公式情報をもとにした公開情報です。上久堅公民館は、各種行事・催事や貸館による市民活動の場を提供しています。利用条件は出典ページで確認してください。'::text,'飯田市「上久堅公民館」'::text,'https://www.city.iida.lg.jp/soshiki/143/'::text),
    ('iida-public-post-iida-station-transit'::text,'iida-public-place-iida-station'::text,'道路・交通'::text,'飯田市公式情報をもとにした公開情報です。飯田駅周辺ではJR飯田線や市民バス・広域バスなどを利用できます。路線・運行時刻・運賃は変更されるため、最新情報を出典ページで確認してください。'::text,'飯田市「公共交通総合案内」'::text,'https://www.city.iida.lg.jp/soshiki/10/p0182.html'::text)
  ) as v(post_key,place_key,category,content,source_name,source_url)
),
inserted_posts as (
  insert into public.posts(
    place_id,category,content,occurred_at,occurred_period,source_type,status,report_count,user_id,
    source_name,source_url,source_retrieved_at,public_data_key
  )
  select
    m.place_id,s.category,s.content,null,'unknown','public_source','published',0,null,
    s.source_name,s.source_url,date '2026-08-26',s.post_key
  from seed_posts s
  join place_map m on m.public_data_key=s.place_key
  on conflict (public_data_key) where public_data_key is not null do nothing
  returning id
)
select
  (select count(*) from inserted_places) as places_inserted,
  (select count(*) from tagged_existing_places) as existing_places_tagged,
  (select count(*) from inserted_posts) as posts_inserted;
