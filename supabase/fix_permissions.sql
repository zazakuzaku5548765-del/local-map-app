-- schema.sqlを既に実行済みで、permission deniedが出る場合の追加権限です。
-- Supabase Dashboard > SQL Editor > New query で実行してください。
grant usage on schema public to anon, authenticated;
grant select on table public.places to anon, authenticated;
grant select, insert on table public.posts to anon, authenticated;
grant insert on table public.reports to anon, authenticated;
