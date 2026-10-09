// Adversarial SQL Challenge Harness for Milestone 1 (R1)
// File: scripts/test-rooms-privacy-and-invites-sql.mjs
// Run: node scripts/test-rooms-privacy-and-invites-sql.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const file = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? uid(n) : '']);
  if (n) {
    await db.exec('set role authenticated');
  }
};

let checks = 0;
const check = (val, label) => {
  assert.ok(val, label);
  checks++;
};

const denied = async (sql, args = [], label = 'Expected permission/check denial') => {
  await assert.rejects(async () => {
    await db.query(sql, args);
  }, (err) => {
    return true;
  }, `${label}: ${sql}`);
  checks++;
};

console.log('--- Initializing PGlite & Prerequisites ---');

// 1. Setup Auth and Base Schemas
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users(id uuid primary key, email text unique, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant usage, select on sequences to authenticated;
  create publication supabase_realtime;
`);

// 2. Load Base Migrations
await db.exec(await file('user_backups.sql'));
await db.exec(await file('cloud_backup_revisions.sql'));
await db.exec(await file('public_pace.sql'));
await db.exec((await file('community.sql')).replace('create extension if not exists pgcrypto;', ''));
await db.exec(await file('community_hashtags.sql'));
await db.exec(await file('board_evidence.sql'));

// Load Hub & Private Rooms Base Schemas
await db.exec((await file('hub_private_rooms.sql')).replace('create extension if not exists pgcrypto;', ''));
await db.exec(await file('hub_private_fixup.sql'));

// Insert test users
for (let i = 1; i <= 6; i++) {
  await query('insert into auth.users(id, email) values($1, $2)', [uid(i), `user${i}@example.com`]);
  await query('insert into public.profiles(id, username, display_name) values($1, $2, $3)', [
    uid(i),
    `user_${i}`,
    `User Display ${i}`,
  ]);
  await query('insert into public.public_pace(user_id, display_name) values($1, $2)', [
    uid(i),
    `User Display ${i}`,
  ]);
}

// Create a pre-migration legacy squad to test migration backfill
const legacySquadId = '20000000-0000-0000-0000-000000000001';
await query(`
  insert into public.squads (id, name, bar_hours, allow_join_requests, created_by)
  values ($1, 'Legacy Private Squad', 5, false, $2)
`, [legacySquadId, uid(1)]);

console.log('--- Applying Milestone 1 Migration: supabase/rooms_privacy_and_invites.sql ---');
const migrationSql = await file('rooms_privacy_and_invites.sql');
await db.exec(migrationSql);
check(true, 'rooms_privacy_and_invites.sql applies cleanly on first run');

// Test Idempotency (run second time)
await db.exec(migrationSql);
check(true, 'rooms_privacy_and_invites.sql is idempotent (clean rerun)');

// ============================================================================
// CHALLENGE 1: Schema Integrity & Legacy Backfill
// ============================================================================
console.log('--- Challenge 1: Schema Integrity & Backfill ---');

const legacySquad = (await query('select * from public.squads where id = $1', [legacySquadId]))[0];
check(legacySquad.privacy === 'invite_only', 'Legacy squad with allow_join_requests=false was backfilled to invite_only');

// Bar hours is nullable and defaults to null
const squadNullPaceId = '20000000-0000-0000-0000-000000000002';
await query(`
  insert into public.squads (id, name, created_by)
  values ($1, 'Null Pace Squad', $2)
`, [squadNullPaceId, uid(1)]);

const nullPaceSquad = (await query('select * from public.squads where id = $1', [squadNullPaceId]))[0];
check(nullPaceSquad.bar_hours === null, 'bar_hours defaults to NULL');
check(nullPaceSquad.privacy === 'anyone_can_join', 'privacy defaults to anyone_can_join');

// Privacy CHECK constraint rejects invalid values
await denied(
  `insert into public.squads (name, privacy, created_by) values ('Bad Privacy', 'invalid_mode', $1)`,
  [uid(1)],
  'Privacy check constraint rejects invalid value'
);

// Extreme bar_hours: 0, fractions, large numbers
const squadExtremeId = '20000000-0000-0000-0000-000000000003';
await query(`
  insert into public.squads (id, name, bar_hours, created_by)
  values ($1, 'Extreme Pace Squad', 0.0001, $2)
`, [squadExtremeId, uid(1)]);
check(Number((await query('select bar_hours from public.squads where id = $1', [squadExtremeId]))[0].bar_hours) === 0.0001, 'Fractional bar_hours accepted');

// ============================================================================
// CHALLENGE 2: Privacy Transitions & Discovery Logic
// ============================================================================
console.log('--- Challenge 2: Privacy Transitions & Discovery Logic ---');

const publicSquadId = '20000000-0000-0000-0000-000000000010';
await as(1); // User 1 creates public room
await query(`
  insert into public.squads (id, name, privacy, allow_join_requests, created_by)
  values ($1, 'Public Room', 'anyone_can_join', true, $2)
`, [publicSquadId, uid(1)]);
await query(`
  insert into public.squad_members (squad_id, user_id, role, status)
  values ($1, $2, 'admin', 'accepted')
`, [publicSquadId, uid(1)]);

// User 2 discovers public room
await as(2);
let discovered = await query('select * from public.discover_squads()');
check(discovered.some((s) => s.id === publicSquadId), 'User 2 discovers anyone_can_join room');

// User 1 transitions room to invite_only
await as(1);
await query(`
  update public.squads set privacy = 'invite_only', allow_join_requests = false
  where id = $1
`, [publicSquadId]);

// User 2 should NO LONGER discover the room
await as(2);
discovered = await query('select * from public.discover_squads()');
check(!discovered.some((s) => s.id === publicSquadId), 'invite_only room is hidden from discover_squads()');

// User 2 attempts direct SELECT on invite_only room
const directSelect = await query('select * from public.squads where id = $1', [publicSquadId]);
check(directSelect.length === 0, 'Non-member cannot view invite_only squad directly via RLS');

// User 1 transitions room back to anyone_can_join
await as(1);
await query(`
  update public.squads set privacy = 'anyone_can_join', allow_join_requests = true
  where id = $1
`, [publicSquadId]);

await as(2);
discovered = await query('select * from public.discover_squads()');
check(discovered.some((s) => s.id === publicSquadId), 'Room reappears in discover_squads() after switching back to anyone_can_join');

// ============================================================================
// CHALLENGE 3: Squad Member RLS (Self-Join vs Invites)
// ============================================================================
console.log('--- Challenge 3: Squad Member RLS ---');

const inviteOnlySquadId = '20000000-0000-0000-0000-000000000020';
await as(1);
await query(`
  insert into public.squads (id, name, privacy, allow_join_requests, created_by)
  values ($1, 'Strict Invite Only', 'invite_only', false, $2)
`, [inviteOnlySquadId, uid(1)]);
await query(`
  insert into public.squad_members (squad_id, user_id, role, status)
  values ($1, $2, 'admin', 'accepted')
`, [inviteOnlySquadId, uid(1)]);

// Adversarial: User 3 attempts unauthorized self-join to invite-only room
await as(3);
await denied(
  `insert into public.squad_members (squad_id, user_id, role, status) values ($1, $2, 'member', 'accepted')`,
  [inviteOnlySquadId, uid(3)],
  'User cannot self-join invite_only squad'
);

// Adversarial: User 3 attempts to insert themselves as invited
await denied(
  `insert into public.squad_members (squad_id, user_id, role, status) values ($1, $2, 'member', 'invited')`,
  [inviteOnlySquadId, uid(3)],
  'Non-admin cannot invite themselves into invite_only squad'
);

// Admin (User 1) invites User 3
await as(1);
await query(
  `insert into public.squad_members (squad_id, user_id, role, status) values ($1, $2, 'member', 'invited')`,
  [inviteOnlySquadId, uid(3)]
);
check(true, 'Admin can insert row with status=invited');

// Adversarial: Admin attempts to force User 4 directly into accepted status without their consent
await denied(
  `insert into public.squad_members (squad_id, user_id, role, status) values ($1, $2, 'member', 'accepted')`,
  [inviteOnlySquadId, uid(4)],
  'Admin cannot force another user into status=accepted (only invited allowed)'
);

// Invited user (User 3) can now view the squad via RLS
await as(3);
const invitedView = await query('select * from public.squads where id = $1', [inviteOnlySquadId]);
check(invitedView.length === 1 && invitedView[0].id === inviteOnlySquadId, 'Invited user can view squad details via RLS');

// But invited user CANNOT view squad messages before accepting!
const msgSquad = await query('select * from public.squad_messages where squad_id = $1', [inviteOnlySquadId]);
check(msgSquad.length === 0, 'Invited user cannot view squad_messages before accepting');

// Invited user accepts invite
await query(`
  update public.squad_members set status = 'accepted' where squad_id = $1 and user_id = $2
`, [inviteOnlySquadId, uid(3)]);
check(true, 'Invited user accepted membership');

// ============================================================================
// CHALLENGE 4: Atomic Username Invite RPC (invite_to_squad_by_username)
// ============================================================================
console.log('--- Challenge 4: invite_to_squad_by_username RPC ---');

// 4.1: Unauthenticated call
await as(null);
const unauthRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_4']))[0].res;
check(unauthRes.ok === false && unauthRes.error === 'Authentication required', 'Unauthenticated invite rejected');

// 4.2: Non-admin caller (User 2 is not in squad)
await as(2);
const nonAdminRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_4']))[0].res;
check(nonAdminRes.ok === false && nonAdminRes.error === 'Only squad admins can invite members', 'Non-admin invite rejected');

// 4.3: Regular member caller (User 3 is member, not admin)
await as(3);
const memberRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_4']))[0].res;
check(memberRes.ok === false && memberRes.error === 'Only squad admins can invite members', 'Regular member invite rejected');

// 4.4: Admin caller, invalid usernames
await as(1);
const emptyRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, '']))[0].res;
check(emptyRes.ok === false && emptyRes.error === 'Invalid username', 'Empty username rejected');

const spacesRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, '   ']))[0].res;
check(spacesRes.ok === false && spacesRes.error === 'Invalid username', 'Spaces-only username rejected');

const soloAtRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, '@']))[0].res;
check(soloAtRes.ok === false && soloAtRes.error === 'Invalid username', 'Solo @ username rejected');

// 4.5: Non-existent username
const notFoundRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'non_existent_ghost_999']))[0].res;
check(notFoundRes.ok === false && notFoundRes.error === 'User not found', 'Non-existent username returns User not found');

// 4.6: Self-invite (admin invites own handle)
const selfInviteRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, '@user_1']))[0].res;
check(selfInviteRes.ok === false && selfInviteRes.error === 'Cannot invite yourself', 'Self-invite rejected');

// 4.7: Valid invite with messy handle casing & leading @
const validInviteRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, '  @USER_4  ']))[0].res;
check(validInviteRes.ok === true && validInviteRes.user_id === uid(4), 'Messy handle @USER_4 successfully normalized and invited');

// Verify row was inserted with status='invited'
const invitedRow = (await query('select * from public.squad_members where squad_id = $1 and user_id = $2', [inviteOnlySquadId, uid(4)]))[0];
check(invitedRow.status === 'invited' && invitedRow.role === 'member', 'Invited row has status=invited, role=member');

// 4.8: Duplicate invite while pending
const dupInviteRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_4']))[0].res;
check(dupInviteRes.ok === false && dupInviteRes.error.includes('already in this squad or has a pending invite'), 'Duplicate invite rejected');

// 4.9: Inviting an already accepted member
const acceptedInviteRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_3']))[0].res;
check(acceptedInviteRes.ok === false && acceptedInviteRes.error.includes('already in this squad or has a pending invite'), 'Inviting accepted member rejected');

// 4.10: Re-invite after invite deletion/rejection
await as(4);
await query('delete from public.squad_members where squad_id = $1 and user_id = $2', [inviteOnlySquadId, uid(4)]);
await as(1);
const reInviteRes = (await query('select public.invite_to_squad_by_username($1, $2) res', [inviteOnlySquadId, 'user_4']))[0].res;
check(reInviteRes.ok === true && reInviteRes.user_id === uid(4), 'Re-invite succeeds after previous invite rejected/deleted');

// ============================================================================
// CHALLENGE 5: Display Name Sync Triggers
// ============================================================================
console.log('--- Challenge 5: Display Name Sync Triggers ---');

// Update profile display name for user 1
await as(1);
await query("update public.profiles set display_name = 'Renamed Commander' where id = $1", [uid(1)]);

// Check that public_pace was automatically updated by trigger
const paceRow = (await query('select display_name from public.public_pace where user_id = $1', [uid(1)]))[0];
check(paceRow.display_name === 'Renamed Commander', 'profiles.display_name syncs automatically to public_pace.display_name');

// Verify board_pace_rows joins profiles.display_name
const boardRows = await query("select * from public.board_pace_rows('UTC') where user_id = $1", [uid(1)]);
check(boardRows.length > 0 && boardRows[0].display_name === 'Renamed Commander', 'board_pace_rows uses profiles.display_name directly');

console.log(`\nAll ${checks} adversarial SQL checks passed successfully!`);
