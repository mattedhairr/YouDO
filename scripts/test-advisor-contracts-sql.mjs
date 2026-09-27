import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const rows = async sql => (await db.query(sql)).rows;
try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, created_at timestamptz default now(), email_confirmed_at timestamptz, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage,select on sequences to authenticated;
  `);
  for (const name of ['user_backups', 'cloud_backup_revisions', 'public_pace', 'community', 'community_chat', 'community_hashtags', 'community_hashtag_admin', 'app_quotes', 'board_evidence', 'community_rooms']) {
    const sql = await readFile(new URL(`../supabase/${name}.sql`, import.meta.url), 'utf8');
    await db.exec(sql.replace('create extension if not exists pgcrypto;', ''));
  }
  const exposed = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE') order by p.proname`);
  assert.deepEqual(exposed.map(row => row.proname), ['active_app_quotes'], 'Only published app quotes are an anonymous SECURITY DEFINER API');
  const unconfigured = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%')`);
  assert.deepEqual(unconfigured, [], 'Every elevated function pins its search path');
  const privateTables = ['app_quote_settings', 'app_quotes', 'board_evidence_state', 'board_focus_sessions',
    'community_activity', 'community_hashtag_memberships', 'community_hashtag_requests', 'community_hashtags', 'community_read_state', 'community_room_read_state'];
  for (const name of privateTables) {
    const [table] = await rows(`select relrowsecurity from pg_class where oid='public.${name}'::regclass`);
    assert.equal(table.relrowsecurity, true, `${name} keeps RLS enabled`);
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const [grant] = await rows(`select has_table_privilege('${role}','public.${name}','${privilege}') allowed`);
        assert.equal(grant.allowed, false, `${role} has no direct ${privilege} on ${name}`);
      }
    }
  }
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await rows(`select has_schema_privilege('${role}','public','CREATE') allowed`))[0].allowed, false);
  }
  await db.exec('set role anon');
  assert.equal((await rows('select count(*)::int n from public.active_app_quotes()'))[0].n, 20);
  await assert.rejects(() => db.query('select * from public.board_pace_rows()'));
  await db.exec('reset role');
  await db.exec("select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false); set role authenticated;");
  await assert.rejects(() => db.query('select * from public.admin_app_quotes()'));
  await assert.rejects(() => db.query('select * from public.admin_community_hashtags()'));
  await assert.rejects(() => db.query("select public.set_community_staff('missing@example.invalid','admin',true)"));
  await assert.rejects(() => db.query("select public.remove_community_staff('missing@example.invalid')"));
  console.log('Advisor contracts passed: anonymous allowlist, pinned search paths, private-table grants, schema access and staff-only RPC denial.');
} finally {
  await db.close();
}
