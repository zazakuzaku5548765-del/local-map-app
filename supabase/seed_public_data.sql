-- まちこえ：飯田市公的情報seed（2026-08-26調査）
-- 注意：先に migrations/20260826_01_add_public_source_enum.sql、次に
-- migrations/20260826_public_sources.sql を、それぞれ別クエリで実行してください。
-- このファイルはSQL Editorで手動実行するまで本番DBを変更しません。
-- 座標は飯田市公式ページの施設情報とNominatim検索結果を突合できた地点だけを採用しています。

-- 一時テーブルを使わない単一SQL文です。全処理は1ステートメントとして原子的に実行されます。
with
seed_places(public_data_key,name,address,latitude,longitude) as (values
  ('iida-public-place-central-library','飯田市立中央図書館','長野県飯田市追手町2丁目677番地3',35.5132069::double precision,137.8296314::double precision),
  ('iida-public-place-city-hall','飯田市役所','長野県飯田市大久保町2534番地',35.5148591::double precision,137.8215335::double precision),
  ('iida-public-place-kamihisakata-community-center','上久堅公民館','長野県飯田市上久堅3769',35.4608741::double precision,137.8824510::double precision),
  ('iida-public-place-iida-station','飯田駅',null::text,35.5187725::double precision,137.8207373::double precision)
),
-- 同じseed key、同名地点、または約20m以内の既存地点を1件だけ選びます。
existing_places as (
  select s.public_data_key,matched.id as place_id
  from seed_places s
  cross join lateral (
    select p.id from public.places p
    where p.public_data_key=s.public_data_key
      or lower(trim(coalesce(p.name,'')))=lower(trim(s.name))
      or (abs(p.latitude-s.latitude)<0.00018 and abs(p.longitude-s.longitude)<0.00022)
    order by (p.public_data_key=s.public_data_key) desc,
      (lower(trim(coalesce(p.name,'')))=lower(trim(s.name))) desc,p.created_at asc
    limit 1
  ) matched
),
inserted_places as (
  insert into public.places(name,address,latitude,longitude,public_data_key)
  select s.name,s.address,s.latitude,s.longitude,s.public_data_key
  from seed_places s
  where not exists(select 1 from existing_places e where e.public_data_key=s.public_data_key)
  on conflict (public_data_key) where public_data_key is not null
  do update set public_data_key=excluded.public_data_key
  returning public_data_key,id as place_id
),
place_map as (
  select public_data_key,place_id from existing_places
  union all
  select public_data_key,place_id from inserted_places
),
tagged_existing_places as (
  update public.places p set public_data_key=m.public_data_key
  from place_map m
  where p.id=m.place_id and p.public_data_key is null
  returning p.id
),
seed_posts(post_key,place_key,category,content,source_name,source_url) as (values
  ('iida-public-post-central-library','iida-public-place-central-library','店舗・施設','飯田市公式情報をもとにした公開情報です。飯田市立中央図書館では、蔵書の貸し出し・返却受付や各種催事を行っています。最新の開館情報は出典ページで確認してください。','飯田市「中央図書館」','https://www.city.iida.lg.jp/soshiki/42/'),
  ('iida-public-post-city-hall','iida-public-place-city-hall','店舗・施設','飯田市公式情報をもとにした公開情報です。飯田市役所本庁舎の所在地や窓口案内は、飯田市公式の庁舎案内で確認できます。来庁前に最新情報を確認してください。','飯田市「飯田市役所のご案内」','https://www.city.iida.lg.jp/soshiki/8/cityhallguide.html'),
  ('iida-public-post-kamihisakata-community-center','iida-public-place-kamihisakata-community-center','店舗・施設','飯田市公式情報をもとにした公開情報です。上久堅公民館は、各種行事・催事や貸館による市民活動の場を提供しています。利用条件は出典ページで確認してください。','飯田市「上久堅公民館」','https://www.city.iida.lg.jp/soshiki/143/'),
  ('iida-public-post-iida-station-transit','iida-public-place-iida-station','道路・交通','飯田市公式情報をもとにした公開情報です。飯田駅周辺ではJR飯田線や市民バス・広域バスなどを利用できます。路線・運行時刻・運賃は変更されるため、最新情報を出典ページで確認してください。','飯田市「公共交通総合案内」','https://www.city.iida.lg.jp/soshiki/10/p0182.html')
),
inserted_posts as (
  insert into public.posts(
    place_id,category,content,occurred_at,occurred_period,source_type,status,report_count,user_id,
    source_name,source_url,source_retrieved_at,public_data_key
  )
  select m.place_id,s.category,s.content,null,'unknown','public_source','published',0,null,
    s.source_name,s.source_url,date '2026-08-26',s.post_key
  from seed_posts s join place_map m on m.public_data_key=s.place_key
  on conflict (public_data_key) where public_data_key is not null do nothing
  returning id
)
select
  (select count(*) from inserted_places) as places_inserted,
  (select count(*) from tagged_existing_places) as existing_places_tagged,
  (select count(*) from inserted_posts) as posts_inserted;

-- ===== 今回の除外・TODO（座標を推測しないため投入しません） =====
-- 2. 丘の上結いスクエア3階 ムトスぷらざ
--    公式所在地：飯田市東和町2丁目35番地。Nominatimで施設名・住所とも一意に取得できず除外。
--    出典候補：https://www.city.iida.lg.jp/soshiki/9/mutosuiida-jigyougaiyou.html
--    TODO：施設管理者が示す座標、または信頼できる地理データで建物位置を確認する。
-- 3. 飯田駅前図書館
--    公式資料で「丘の上結いスクエア3階」を確認したが、施設単独の座標を一意に取得できず除外。
--    出典候補：https://www.city.iida.lg.jp/uploaded/attachment/63939.pdf
--    TODO：飯田市立図書館の現行公式施設ページと座標を確認する。
-- 5. 竜丘公民館
--    公式所在地：飯田市桐林505。Nominatim名称検索が飯田市外の別施設を返し、住所検索も結果なしのため除外。
--    出典候補：https://www.city.iida.lg.jp/soshiki/146/
--    TODO：施設管理者が示す座標、または信頼できる地理データで確認する。
-- 8. 飯田市内の路線バス
--    市内全域にまたがり単一地点ではないため除外。出典：https://www.city.iida.lg.jp/soshiki/10/p0182.html
-- 9. リニア長野県駅予定地周辺
--    「周辺」の範囲と確定地点をこの調査では一意に確定できないため除外。TODO：公式事業図面の確定座標を確認する。
-- 10. 飯田市南信濃・かつら沢橋周辺
--    橋の公式な地点座標と、掲載する現行情報の出典URLを確認できないため除外。TODO：道路管理者の公開資料を確認する。
