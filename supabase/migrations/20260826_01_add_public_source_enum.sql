-- 第1段階：enum値の追加だけを実行し、確実にcommitさせます。
-- 実行完了後、別のSQL Editorクエリで 20260826_public_sources.sql を実行してください。
alter type public.source_type add value if not exists 'public_source';
