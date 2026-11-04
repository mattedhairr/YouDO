// Isolated PostgreSQL contract tests for the server-side cloud backup limits.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const id = (n) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = async (user) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id(user)]);
  await db.exec('set role authenticated');
};
const fails = async (sql, args, pattern, label) => {
  let message = '';
  try { await db.query(sql, args); } catch (error) { message = error.message; }
  check(pattern.test(message), `${label} (got: ${message || 'no error'})`);
};
const snapshotCount = async (user) => {
  await db.exec('reset role');
  return (await db.query('select count(*)::int n from public.user_backup_snapshots where user_id=$1', [id(user)])).rows[0].n;
};
const big = (mb) => 'x'.repeat(mb * 1024 * 1024 + 1);

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  for (const name of ['user_backups', 'cloud_backup_revisions', 'user_backup_snapshots']) {
    await db.exec((await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }
  await db.exec('grant select, insert, update, delete on public.user_backups, public.user_backup_snapshots to authenticated;');
  for (let n = 1; n <= 2; n++) await db.query('insert into auth.users values ($1)', [id(n)]);

  // A row older than the limits must survive the migration.
  await db.query('insert into public.user_backup_snapshots(user_id, backup_data) values ($1, $2)', [id(2), big(9)]);

  const migration = await readFile(new URL('../../supabase/cloud_backup_limits.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  check(true, 'the limits migration is rerunnable');
  check(await snapshotCount(2) === 1, 'rows saved earlier are left alone');

  await as(1);
  await db.query("insert into public.user_backups(user_id, backup_data) values ($1, '{}')", [id(1)]);
  await fails('update public.user_backups set backup_data=$1 where user_id=$2', [big(4), id(1)], /user_backups_size_limit/, 'a direct write cannot pass 4 MB');
  await fails('select public.cas_user_backup(1, $1)', [big(4)], /4 MB limit/, 'a compare-and-set write cannot pass 4 MB');
  const written = await db.query("select new_revision from public.cas_user_backup(1, '{\"ok\":1}')");
  check(written.rows.length === 1, 'an ordinary write still succeeds');

  await fails('insert into public.user_backup_snapshots(user_id, backup_data) values ($1, $2)', [id(1), big(8)], /user_backup_snapshots_size_limit/, 'a restore point cannot pass 8 MB');
  await db.query('insert into public.user_backup_snapshots(user_id, backup_data) values ($1, $2)', [id(1), big(5)]);
  check(await snapshotCount(1) === 1, 'a restore point over 4 MB can still be saved');

  await as(1);
  for (let n = 0; n < 14; n++) {
    await db.query("insert into public.user_backup_snapshots(user_id, backup_data, created_at) values ($1, $2, now() + make_interval(secs => $3))", [id(1), `copy ${n}`, n + 1]);
    await db.query('select 1');
  }
  check(await snapshotCount(1) === 10, 'only the newest 10 restore points are kept');
  await db.exec('reset role');
  const newest = await db.query('select backup_data from public.user_backup_snapshots where user_id=$1 order by created_at desc limit 1', [id(1)]);
  check(newest.rows[0].backup_data === 'copy 13', 'the newest restore point is the one kept');
  check(await snapshotCount(2) === 1, "trimming one account never touches another's");

  console.log(`PASS: ${checks} isolated PostgreSQL checks for cloud backup limits.`);
} finally {
  await db.close();
}
