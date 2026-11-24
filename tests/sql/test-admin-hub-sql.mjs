// Isolated PostgreSQL checks for admin_hub.sql: what the owner and admins may
// see and do from the Admin Hub, the growth numbers, and which accounts count
// as junk. Every person here is made up.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `60000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
  await db.exec(n ? 'set role authenticated' : 'set role anon');
};
const fails = async (sql, args, label) => {
  let error = null;
  try { await db.query(sql, args); } catch (caught) { error = caught; }
  check(error !== null, label);
  return error?.message ?? '';
};

try {
  const harness = (await readFile(new URL('./test-full-setup-sql.mjs', import.meta.url), 'utf8')).match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(harness);
  const load = async (name) => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const name of SUPABASE_SETUP_ORDER) await db.exec(await load(name));
  check(SUPABASE_SETUP_ORDER.includes('admin_hub'), 'admin_hub.sql is part of the full setup');

  const day = 24 * 60 * 60 * 1000;
  const ago = (days) => new Date(Date.now() - days * day).toISOString();
  // 1 owner, 2 admin, 3 Meera (a real member), 4 unconfirmed for 10 days, 5 unconfirmed for 2 days,
  // 6 confirmed, nothing saved, quiet 70 days, 7 the same but signed in 5 days ago, 8 quiet with a real backup,
  // 9 quiet backer, 10 confirmed last week with no name yet.
  const people = [
    [1, 'owner', ago(200), ago(200), ago(0)], [2, 'anjali', ago(150), ago(150), ago(1)], [3, 'meera', ago(50), ago(50), ago(0)],
    [4, 'ghost4', ago(10), null, null], [5, 'fresh5', ago(2), null, null], [6, 'quiet6', ago(90), ago(90), ago(70)],
    [7, 'back7', ago(90), ago(90), ago(5)], [8, 'saver8', ago(90), ago(90), ago(70)], [9, 'backer9', ago(90), ago(90), ago(70)],
    [10, 'noname10', ago(6), ago(6), ago(6)],
  ];
  for (const [n, name, created, confirmed, signIn] of people) {
    await db.query('insert into auth.users(id, email, created_at, email_confirmed_at, last_sign_in_at) values ($1, $2, $3, $4, $5)',
      [id(n), `${name}@example.com`, created, confirmed, signIn]);
  }
  for (const [n, username, name] of [[1, 'owner', 'Owner'], [2, 'anjali', 'Anjali R.'], [3, 'meera_s', 'Meera Shah']]) {
    await db.query('insert into public.profiles(id, username, display_name) values ($1, $2, $3)', [id(n), username, name]);
  }
  await db.query("insert into public.community_admins(user_id, role) values ($1, 'owner'), ($2, 'admin')", [id(1), id(2)]);
  await db.query("insert into public.public_pace(user_id, display_name, week_ms) values ($1, 'Meera Shah', 15000000)", [id(3)]);
  await db.query("insert into public.user_backups(user_id, backup_data, updated_at) values ($1, $2, $3), ($4, $5, $6)",
    [id(3), 'x'.repeat(5000), ago(0), id(8), 'x'.repeat(5000), ago(70)]);
  await db.query("insert into public.hub_backers(user_id, amount, utr, status) values ($1, 99, '123456789012', 'verified')", [id(9)]);

  // Roles: each person learns only their own.
  await as(1); check(await one('select public.admin_hub_role()') === 'owner', 'the owner learns they are the owner');
  await as(2); check(await one('select public.admin_hub_role()') === 'admin', 'an admin learns they are an admin');
  await as(3); check(await one('select public.admin_hub_role()') === null, 'a member has no role');
  await fails('select public.admin_people()', [], 'a member cannot list people');
  await fails('select public.admin_person($1)', [id(2)], 'a member cannot look anyone up');
  await fails('select * from public.admin_account_facts()', [], 'nobody calls the raw account facts');

  // An admin: people with a name, no emails or saved-data sizes, no owner filters.
  await as(2);
  let list = await one("select public.admin_people('', 'all', 40, 0)");
  check(list.people.length === 3 && list.counts.all === 3, 'admins see only people with a name in YouDO');
  check(list.people.every((person) => !('email' in person) && !('backup_bytes' in person) && !('junk' in person)), 'admins never get emails, data sizes or junk flags');
  check(list.people[0].staff_role === 'owner', 'the owner is listed first');
  check((await one("select public.admin_people('meera@', 'all', 40, 0)")).people.length === 0, 'admins cannot search by email');
  check((await one("select public.admin_people('@meera', 'all', 40, 0)")).people[0].username === 'meera_s', 'admins search by @username');
  await fails("select public.admin_people('', 'junk', 40, 0)", [], 'the junk filter is the owner\'s');
  const meera = await one('select public.admin_person($1)', [id(3)]);
  check(meera.on_board && 'board_week_ms' in meera && !('email' in meera), 'an admin sees Meera\'s community side only');
  await fails('select public.admin_person($1)', [id(6)], 'an admin cannot open an account with no name');
  await fails("select public.owner_set_staff($1, 'promote')", [id(3)], 'an admin cannot make admins');
  await fails('select public.owner_growth_report()', [], 'an admin cannot see growth');
  await fails('select public.owner_cleanup_preview()', [], 'an admin cannot preview the cleanup');
  await fails("select public.owner_accounts_to_delete('one', null, $1, 'meera_s')", [id(3)], 'an admin cannot delete accounts');
  await fails('select public.set_community_settings(false, true, $1)', [''], 'an admin cannot turn the room off for everyone');

  // The owner: everyone, with emails, and the junk filter.
  await as(1);
  list = await one("select public.admin_people('', 'all', 40, 0)");
  check(list.counts.all === 10 && list.people.length === 10, 'the owner sees every account');
  check(list.people.find((person) => person.user_id === id(3)).email === 'meera@example.com', 'the owner sees emails');
  check((await one("select public.admin_people('quiet6@', 'all', 40, 0)")).people.length === 1, 'the owner searches by email');
  const junk = (await one("select public.admin_people('', 'junk', 40, 0)")).people.map((person) => person.user_id).sort();
  check(junk.join() === [id(4), id(6)].join(), 'junk is the old unconfirmed account and the quiet empty one, nothing else');
  check((await one("select public.admin_people('', 'staff', 40, 0)")).people.length === 2, 'the staff filter');

  // Staff changes.
  let changed = await one("select public.owner_set_staff($1, 'promote')", [id(3)]);
  check(changed.staff_role === 'admin' && changed.badge_visible === true, 'the owner makes Meera an admin, badge shown');
  changed = await one("select public.owner_set_staff($1, 'hide_badge')", [id(3)]);
  check(changed.badge_visible === false, 'and hides her badge');
  changed = await one("select public.owner_set_staff($1, 'demote')", [id(3)]);
  check(!('staff_role' in changed), 'and removes her as admin');
  const ownerChange = await fails("select public.owner_set_staff($1, 'demote')", [id(1)], 'the owner\'s own role never changes in the app');
  check(ownerChange.includes('only in Supabase'), 'it says where ownership changes');
  await db.exec('reset role');
  check(await one("select count(*)::int from public.community_audit_log where action like 'staff.%'") === 3, 'each staff change is in the log');
  check(await one("select count(*)::int from public.community_admins where role = 'owner'") === 1, 'still exactly one owner');

  // Growth, counts only.
  await as(1);
  const growth = await one('select public.owner_growth_report(12)');
  check(growth.accounts === 10 && growth.confirmed === 8, 'growth counts accounts and confirmed ones');
  check(growth.cleanup.unconfirmed === 1 && growth.cleanup.empty === 1, 'growth shows the cleanup sizes');
  check(growth.weeks.length === 12 && growth.database_bytes > 0, 'twelve weeks and the database size');
  check(!JSON.stringify(growth).includes('@example.com') && !JSON.stringify(growth).includes(id(3)), 'no emails or ids in the report');
  const preview = await one('select public.owner_cleanup_preview(50)');
  check(preview.unconfirmed === 1 && preview.empty === 1 && preview.sample.length === 2 && !JSON.stringify(preview).includes('@'), 'the cleanup preview has dates, not people');

  // What the edge function may delete.
  const ids = await one("select public.owner_accounts_to_delete('all', 2)");
  check([...ids].sort().join() === [id(4), id(6)].join(), 'the cleanup deletes exactly the junk');
  check((await fails("select public.owner_accounts_to_delete('all', 5)", [], 'a changed count stops the cleanup')).includes('changed'), 'and says the list changed');
  await fails("select public.owner_accounts_to_delete('one', null, $1, 'wrong')", [id(3)], 'one account needs its @username typed');
  check((await one("select public.owner_accounts_to_delete('one', null, $1, 'meera_s')", [id(3)]))[0] === id(3), 'with it, Meera can be deleted');
  check(await one("select public.owner_accounts_to_delete('one', null, $1, 'DELETE')", [id(6)]) !== null, 'an account with no username takes DELETE');
  await fails("select public.owner_accounts_to_delete('one', null, $1, 'anjali')", [id(2)], 'staff cannot be deleted');
  await fails("select public.owner_accounts_to_delete('one', null, $1, 'DELETE')", [id(1)], 'the owner cannot delete themselves here');
  await fails("select public.owner_accounts_to_delete('one', null, $1, 'DELETE')", [id(9)], 'backers cannot be deleted');

  // Deleting cascades; the junk is gone and nothing else.
  await db.exec('reset role');
  await db.query('delete from auth.users where id = any($1::uuid[])', [ids]);
  await as(1);
  await one("select public.owner_log_deletion(2, 'all')");
  const after = await one('select public.owner_growth_report(12)');
  check(after.accounts === 8 && after.cleanup.unconfirmed === 0 && after.cleanup.empty === 0, 'after the cleanup nothing is left to clean');
  await db.query('select public.set_community_settings(true, true, $1)', ['']);
  check(true, 'the owner still controls the room');

  // Reruns cleanly.
  await db.exec('reset role');
  await db.exec(await load('admin_hub'));
  check(true, 'admin_hub.sql is rerunnable');

  console.log(`PASS: ${checks} isolated PostgreSQL checks for the Admin Hub (roles, people, staff, growth, cleanup).`);
} finally {
  await db.close();
}
