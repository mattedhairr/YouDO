// Isolated PostgreSQL verification, no network or production credentials.
import { PGlite } from '../node_modules/.cache/community-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const as = async (user, session) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ? id(user) : '']);
  await db.query("select set_config('request.jwt.claim.session_id', $1, false)", [session ? id(session) : '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
};
const denied = async (sql, args = []) => {
  let failed = false;
  try { await db.query(sql, args); } catch { failed = true; }
  check(failed, `Expected denial: ${sql}`);
};

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(
      id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null, updated_at timestamptz not null,
      refreshed_at timestamptz, user_agent text, not_after timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('session_id', nullif(current_setting('request.jwt.claim.session_id', true), ''))
    $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
  `);
  const sql = await readFile(new URL('../supabase/account_sessions.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  check(true, 'migration is safe to rerun');

  await db.query('insert into auth.users values ($1), ($2)', [id(1), id(2)]);
  await db.query(`insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,user_agent) values
    ($1,$4,now()-interval '25 hours',now(),now(),'Current Android'),
    ($2,$4,now()-interval '3 days',now()-interval '2 hours',now()-interval '2 hours','Windows PC'),
    ($3,$5,now()-interval '3 days',now(),now(),'Other user')`, [id(101), id(102), id(103), id(1), id(2)]);

  await as(1, 101);
  const mine = await rows('select * from public.account_sessions()');
  check(mine.length === 2, 'only caller sessions are listed');
  check(mine[0].session_id === id(101) && mine[0].is_current === true, 'current session is identified first');
  check(mine.find((row) => row.session_id === id(102))?.can_revoke === true, '24-hour trusted session can revoke another');
  await denied('select public.revoke_account_session($1)', [id(101)]);
  check((await rows('select public.revoke_account_session($1) as removed', [id(103)]))[0].removed === false, 'another user session is never removed');
  check((await rows('select public.revoke_account_session($1) as removed', [id(102)]))[0].removed === true, 'owned remote session is removed');
  await db.exec('reset role');
  check((await rows('select * from auth.sessions where id=$1', [id(102)])).length === 0, 'revocation deletes exactly the target session');

  await db.query("insert into auth.sessions(id,user_id,created_at,updated_at,user_agent) values ($1,$2,now()-interval '2 hours',now(),'New browser')", [id(104), id(1)]);
  await as(1, 104);
  const recent = await rows('select * from public.account_sessions()');
  check(recent.every((row) => row.can_revoke === false), 'new current session cannot remotely revoke');
  await denied('select public.revoke_account_session($1)', [id(101)]);

  await as(1, 999);
  check((await rows('select * from public.account_sessions()')).length === 0, 'expired caller JWT cannot list sessions after its session is gone');
  await denied('select public.revoke_account_session($1)', [id(101)]);
  await as(null, null);
  await denied('select * from public.account_sessions()');
  await denied('select public.revoke_account_session($1)', [id(101)]);
  console.log(`PASS: ${checks} isolated PostgreSQL checks (ownership, 24-hour trust, exact revocation, reruns).`);
} finally {
  await db.close();
}
