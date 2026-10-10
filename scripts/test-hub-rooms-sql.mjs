// Isolated PostgreSQL verification for full_hub_rooms_setup.sql and rooms_privacy_and_invites.sql
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const as = async (user) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ? id(user) : '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
};
const denied = async (sql, args = []) => {
  let failed = false;
  try { await db.query(sql, args); } catch { failed = true; }
  check(failed, `Expected denial: ${sql}`);
};

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;
  `);

  for (const name of ['user_backups', 'cloud_backup_revisions', 'public_pace', 'board_evidence']) {
    await db.exec((await readFile(new URL(`../supabase/${name}.sql`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }

  // 1. Run full_hub_rooms_setup.sql twice to verify idempotency
  const fullSql = await readFile(new URL('../supabase/full_hub_rooms_setup.sql', import.meta.url), 'utf8');
  await db.exec(fullSql);
  await db.exec(fullSql);
  check(true, 'full_hub_rooms_setup.sql is idempotent and safe to rerun');

  // 2. Run rooms_privacy_and_invites.sql twice to verify idempotency
  const roomsSql = await readFile(new URL('../supabase/rooms_privacy_and_invites.sql', import.meta.url), 'utf8');
  await db.exec(roomsSql);
  await db.exec(roomsSql);
  check(true, 'rooms_privacy_and_invites.sql is idempotent and safe to rerun');

  // 3. Verify check constraint squads_privacy_check exists
  const constraints = await rows(`
    select conname from pg_constraint
    where conname = 'squads_privacy_check' and conrelid = 'public.squads'::regclass
  `);
  check(constraints.length === 1, 'squads_privacy_check constraint exists on public.squads');

  // 4. Create test users
  await db.query('insert into auth.users values ($1), ($2), ($3)', [id(1), id(2), id(3)]);
  await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
    id(1), 'alice', 'Alice Owner',
  ]);
  await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
    id(2), 'bob', 'Bob Friend',
  ]);
  await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
    id(3), 'charlie', 'Charlie Guest',
  ]);

  // 5. Test inserts as user 1 with all 4 supported privacy values
  await as(1);
  const sq1 = await rows(`
    insert into public.squads (name, created_by, privacy)
    values ('Anyone Can Join Room', $1, 'anyone_can_join')
    returning id, privacy
  `, [id(1)]);
  check(sq1[0].privacy === 'anyone_can_join', 'inserts anyone_can_join successfully');

  const sq2 = await rows(`
    insert into public.squads (name, created_by, privacy)
    values ('Invite Only Room', $1, 'invite_only')
    returning id, privacy
  `, [id(1)]);
  check(sq2[0].privacy === 'invite_only', 'inserts invite_only successfully');

  const sq3 = await rows(`
    insert into public.squads (name, created_by, privacy)
    values ('Legacy Public Room', $1, 'public')
    returning id, privacy
  `, [id(1)]);
  check(sq3[0].privacy === 'public', 'inserts legacy public successfully');

  const sq4 = await rows(`
    insert into public.squads (name, created_by, privacy)
    values ('Legacy Private Room', $1, 'private')
    returning id, privacy
  `, [id(1)]);
  check(sq4[0].privacy === 'private', 'inserts legacy private successfully');

  // Add owner membership for all created rooms
  for (const s of [sq1[0], sq2[0], sq3[0], sq4[0]]) {
    await db.query('insert into public.squad_members (squad_id, user_id, role, status) values ($1, $2, $3, $4)', [
      s.id, id(1), 'admin', 'accepted',
    ]);
  }

  // 6. Test invalid privacy is rejected by check constraint
  await denied(`
    insert into public.squads (name, created_by, privacy)
    values ('Invalid Privacy Room', $1, 'hidden_secret')
  `, [id(1)]);

  await denied(`
    update public.squads set privacy = 'invalid_value' where id = $1
  `, [sq1[0].id]);

  // 7. Test privacy updates to canonical and legacy values succeed
  await db.query("update public.squads set privacy = 'invite_only' where id = $1", [sq1[0].id]);
  const updated1 = await rows('select privacy from public.squads where id = $1', [sq1[0].id]);
  check(updated1[0].privacy === 'invite_only', 'privacy updated to invite_only');

  await db.query("update public.squads set privacy = 'anyone_can_join' where id = $1", [sq1[0].id]);
  const updated2 = await rows('select privacy from public.squads where id = $1', [sq1[0].id]);
  check(updated2[0].privacy === 'anyone_can_join', 'privacy updated back to anyone_can_join');

  // 8. RLS Visibility Checks for non-member user 2
  await as(2);
  const visibleToBob = await rows('select id, name, privacy from public.squads');
  const visibleIds = visibleToBob.map(r => r.id);
  check(visibleIds.includes(sq1[0].id), 'User 2 sees anyone_can_join room');
  check(visibleIds.includes(sq3[0].id), 'User 2 sees legacy public room');
  check(!visibleIds.includes(sq2[0].id), 'User 2 cannot see unjoined invite_only room');
  check(!visibleIds.includes(sq4[0].id), 'User 2 cannot see unjoined legacy private room');

  // 9. discover_squads RPC check
  const discoverable = await rows('select id, name, privacy from public.discover_squads()');
  const discIds = discoverable.map(r => r.id);
  check(discIds.includes(sq1[0].id), 'discover_squads includes anyone_can_join room');
  check(discIds.includes(sq3[0].id), 'discover_squads includes legacy public room');
  check(!discIds.includes(sq2[0].id), 'discover_squads excludes invite_only room');
  check(!discIds.includes(sq4[0].id), 'discover_squads excludes legacy private room');

  // 10. Username Invite RPC Function check
  await as(1); // User 1 is squad admin
  const inviteResRaw = await rows('select public.invite_to_squad_by_username($1, $2) as res', [
    sq2[0].id, 'bob',
  ]);
  const inviteRes = inviteResRaw[0].res;
  check(inviteRes.ok === true && inviteRes.user_id === id(2), 'Admin can invite user by username');

  // Cannot invite yourself
  const selfInviteResRaw = await rows('select public.invite_to_squad_by_username($1, $2) as res', [
    sq2[0].id, 'alice',
  ]);
  check(selfInviteResRaw[0].res.ok === false, 'Cannot invite self');

  // Non-admin (User 2) cannot invite
  await as(2);
  const nonAdminInviteResRaw = await rows('select public.invite_to_squad_by_username($1, $2) as res', [
    sq2[0].id, 'charlie',
  ]);
  check(nonAdminInviteResRaw[0].res.ok === false, 'Non-admin cannot invite to squad');

  console.log(`PASS: ${checks} isolated PostgreSQL checks for hub rooms setup and privacy check constraint.`);
} finally {
  await db.close();
}
