// Builds an empty project with every setup script in SUPABASE_SETUP_ORDER, twice,
// so a new test project can be created from the repository in one run.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const rows = async sql => (await db.query(sql)).rows;
try {
  // Supabase built-ins the scripts rely on.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, created_at timestamptz not null default now(),
      email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb);
    create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null, updated_at timestamptz not null, refreshed_at timestamptz, user_agent text, not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
    create publication supabase_realtime;
    create schema extensions; create schema vault; create schema net;
    create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$select 1::bigint$$;
  `);
  const load = async name => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const pass of [1, 2]) {
    for (const name of SUPABASE_SETUP_ORDER) {
      try {
        await db.exec(await load(name));
      } catch (error) {
        throw new Error(`${name}.sql failed on pass ${pass}: ${error.message}`);
      }
    }
  }
  const tables = (await rows(`select tablename from pg_tables where schemaname='public'`)).map(r => r.tablename);
  for (const table of ['user_backups', 'public_pace', 'community_messages', 'community_hashtag_requests', 'app_quotes',
    'profiles', 'friendships', 'squads', 'squad_members', 'direct_messages', 'squad_messages', 'hub_backers', 'app_support_settings', 'user_push_tokens']) {
    assert.ok(tables.includes(table), `${table} exists`);
  }
  const noRls = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
  assert.deepEqual(noRls, [], 'every public table has RLS enabled');
  const realtime = (await rows(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).map(r => r.tablename);
  for (const table of ['friendships', 'squad_members', 'direct_messages', 'squad_messages']) {
    assert.ok(realtime.includes(table), `${table} streams over Realtime`);
  }
  const board = (await rows(`select pg_get_functiondef('public.board_pace_rows(text)'::regprocedure) d`))[0].d;
  assert.ok(board.includes('public.profiles'), 'the Board uses the Private Hub display name (hub setup ran after board_evidence)');
  const prune = (await rows(`select pg_get_functiondef('public.prune_community_history()'::regprocedure) d`))[0].d;
  assert.ok(prune.includes('community_messages') && prune.includes('direct_messages'), 'pruning covers community and private messages');
  // The one-off patch for older projects must also apply on top of a current setup.
  await db.exec(await load('profiles_hardening'));
  const anonProfiles = (await rows(`select has_table_privilege('anon', 'public.profiles', 'select') ok`))[0].ok;
  assert.equal(anonProfiles, false, 'signed-out visitors cannot read profiles');
  const member = '00000000-0000-4000-8000-0000000000b1';
  await db.exec(`insert into auth.users(id, email) values ('${member}', 'member@example.test')`);
  await db.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${member}', false);
    insert into public.profiles(id, username, display_name, is_backer, backer_tier)
      values ('${member}', 'member', 'Member', true, 'founding');
    update public.profiles set is_backer = true, backer_tier = 'founding', bio = 'hello' where id = '${member}';
    reset role;
  `);
  const own = (await rows(`select is_backer, backer_tier, bio from public.profiles where id = '${member}'`))[0];
  assert.deepEqual(own, { is_backer: false, backer_tier: null, bio: 'hello' }, 'members edit their profile but not their backer badge');
  await db.exec(`update public.profiles set is_backer = true, backer_tier = 'founding' where id = '${member}'`);
  const reviewed = (await rows(`select is_backer from public.profiles where id = '${member}'`))[0].is_backer;
  assert.equal(reviewed, true, 'the admin review (running as the owner) can still grant the badge');
  const cleanup = await rows(`select 1 from pg_proc where proname = 'cleanup_stale_push_tokens'`);
  assert.equal(cleanup.length, 0, 'the unused age-based push token cleanup is gone');
  console.log(`Full setup: ${SUPABASE_SETUP_ORDER.length} scripts apply in order to an empty project and rerun cleanly.`);
} finally {
  await db.close();
}
