-- Read-only metadata. Run each section in the SQL Editor as needed.
-- No passwords, tokens, workspace contents or individual account rows.

-- Estimate table scale before adding/removing indices. Statistics may reset;
-- zero scans alone is not evidence that an index is unnecessary.
select relname as table_name, n_live_tup as estimated_rows,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size, seq_scan, idx_scan
from pg_stat_user_tables where schemaname = 'public' order by relname;

-- Only active_app_quotes is deliberately public without sign-in.
select p.oid::regprocedure::text as function_name,
  has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_access,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_access,
  coalesce(array_to_string(p.proconfig,', '),'MISSING') as settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and (has_function_privilege('anon',p.oid,'EXECUTE') or not exists (
    select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by 1;

-- RPC-only tables must remain inaccessible directly. An empty policy list is
-- intentional; do not add a permissive policy to silence the Advisor.
select c.relname, c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as any_anon_access,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as any_member_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'app_quote_settings','app_quotes','board_evidence_state','board_focus_sessions',
  'community_activity','community_hashtag_memberships','community_hashtag_requests',
  'community_hashtags','community_read_state') order by c.relname;

select has_schema_privilege('anon','public','CREATE') as anon_can_create,
  has_schema_privilege('authenticated','public','CREATE') as member_can_create;
