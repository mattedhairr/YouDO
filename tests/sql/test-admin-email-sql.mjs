// Isolated PostgreSQL checks for admin_email.sql: who an Admin Hub email
// reaches, who may send what, the edge function's batches, "Stop these
// emails" and Owner → Backers. Every person here is made up.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `71000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [typeof n === 'number' && n ? id(n) : '']);
  await db.exec(n === 'service' ? 'set role service_role' : n ? 'set role authenticated' : 'set role anon');
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
  await db.exec('alter role service_role bypassrls'); // as on Supabase
  const load = async (name) => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const name of SUPABASE_SETUP_ORDER) await db.exec(await load(name));
  check(SUPABASE_SETUP_ORDER.indexOf('admin_email') > SUPABASE_SETUP_ORDER.indexOf('admin_hub'), 'admin_email.sql runs after admin_hub.sql');
  await db.exec(await load('admin_email'));
  check(true, 'it runs again on a full project');

  // 1 owner, 2 admin, 3 Meera (backer), 4 Ravi, 5 Kabir (never confirmed), 6 Sana (banned), 7 Zoya (stopped emails).
  const people = ['Owner Demo', 'Anjali R', 'Meera S', 'Ravi K', 'Kabir P', 'Sana T', 'Zoya M'];
  for (let n = 1; n <= people.length; n++) {
    const handle = people[n - 1].toLowerCase().replace(' ', '_');
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [id(n), `${handle}@example.com`, n === 5 ? null : new Date('2026-11-01')]);
    await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$3) on conflict (id) do update set username=excluded.username, display_name=excluded.display_name', [id(n), handle, people[n - 1]]);
  }
  await db.query("insert into public.community_admins(user_id,role) values($1,'owner'),($2,'admin')", [id(1), id(2)]);
  await db.query('insert into public.community_members(user_id,banned_at) values($1,now())', [id(6)]);
  await db.query('insert into public.email_opt_outs(user_id) values($1)', [id(7)]);
  await db.query("insert into public.hub_backers(user_id,username,amount,status,created_at) values($1,'meera_s',100,'verified','2026-11-03'),($1,'meera_s',200,'verified','2026-11-10'),($1,'meera_s',500,'pending',now()),($2,'ravi_k',50,'rejected',now())", [id(3), id(4)]);
  await db.query('update public.profiles set is_backer=true where id=$1', [id(3)]);

  // Members and visitors are kept out.
  await as(0);
  await fails('select public.admin_email_overview()', [], 'a signed-out visitor cannot open Email');
  await as(4);
  await fails('select public.admin_email_overview()', [], 'nor can a member');
  await fails("select public.admin_email_create('update','everyone',null,'Hi','Hello')", [], 'a member cannot send');
  await fails('select public.owner_backers()', [], 'or see backers');
  for (const fn of ["public.email_claim_batch($1, 5)", "public.email_mark($1, $1, 'sent')", 'public.email_set_stopped($1, true)']) {
    await fails(`select ${fn}`, [id(4)], `the app cannot call ${fn.split('(')[0]}`);
  }
  await as(2);
  await fails('select * from public.email_recipients', [], 'the tables are closed to the app');
  await fails('select public.email_claim_batch($1, 5)', [id(4)], 'even admins cannot read addresses');

  // The admin's view.
  let overview = await one('select public.admin_email_overview()');
  check(overview.everyone === 4, 'everyone = the confirmed, not banned, not stopped (owner, admin, Meera, Ravi)');
  check(overview.backers === null, 'an admin does not see the backers count');
  check(overview.limit === 450 && overview.sent_today === 0 && overview.stopped === 1, 'the limit, today and the stopped count');
  await fails("select public.admin_email_create('update','backers',null,'Hi','Hello')", [], 'an admin cannot write to backers');
  await fails("select public.admin_email_create('thanks','people',$1,'Thanks','Hello')", [[id(3)]], 'or send a thank-you');
  await fails("select public.admin_email_create('note','people','{}','Hi','Hello')", [], 'picking nobody is refused');
  await fails("select public.admin_email_create('note','people',$1,'Hi','Hello')", [Array.from({ length: 51 }, (_, i) => id(100 + i))], 'more than 50 is refused');
  await fails("select public.admin_email_create('update','everyone',null,'','Hello')", [], 'a subject is needed');
  await fails("select public.admin_email_create('update','everyone',null,'Hi',$1)", ['x'.repeat(6001)], 'the message has a limit');
  await fails("select public.admin_email_create('note','people',$1,'Hi','Hello')", [[id(5), id(7)]], 'nobody reachable is refused');
  await db.exec('reset role');
  check(Number(await one('select count(*) from public.email_sends')) === 0, 'a refused send leaves nothing behind');
  await as(2);
  check((await one('select public.admin_email_reach($1)', [[id(4), id(5), id(6), id(7)]])) === 2, 'reach counts the picked who can get it (a banned person picked by hand can)');

  const adminSend = await one("select public.admin_email_create('update','everyone',null,'YouDO 9 is here','Hi {name}')");
  check(adminSend.total === 4, 'an admin writes to everyone');
  const note = await one("select public.admin_email_create('note','people',$1,'About your appeal','Hi {name}')", [[id(6)]]);
  check(note.total === 1, 'and a note to one banned person');
  const log = await rows("select admin_id, target_user_id, reason from public.community_audit_log where action='email.sent' order by id");
  check(log.length === 2 && log[0].admin_id === id(2) && log[0].reason === 'YouDO 9 is here · 4 people', 'each send is in the activity log');
  check(log[1].target_user_id === id(6) && log[1].reason.endsWith('1 person'), 'a note to one person names them');
  const self = await one('select public.admin_email_self()');
  check(self.email === 'anjali_r@example.com' && self.name === 'Anjali R', 'a test goes to your own address only');
  const may = await one('select public.admin_email_may_send($1)', [adminSend.id]);
  check(may.left_today === 450 && may.kind === 'update' && may.signer === 'Anjali R', 'the function learns what to send and who signs');

  // The owner.
  await as(1);
  overview = await one('select public.admin_email_overview()');
  check(overview.backers === 1 && overview.sends.length === 2, 'the owner sees backers and every send');
  check(overview.sends[1].sent_by_name === 'Anjali R' && overview.sends[1].waiting === 4, 'with who wrote it and what waits');
  check((await one('select public.admin_email_may_send($1)', [adminSend.id])).kind === 'update', 'the owner may send the rest of an admin\'s email');
  const thanks = await one("select public.admin_email_create('thanks','backers',null,'Thank you','Your {amount}')");
  check(thanks.total === 1, 'thank-yous reach the backers');
  await as(2);
  await fails('select public.admin_email_may_send($1)', [thanks.id], 'an admin cannot send the owner\'s');

  // The edge function, with the service key.
  await as('service');
  const batch = await rows('select * from public.email_claim_batch($1, 3)', [adminSend.id]);
  check(batch.length === 3 && batch.every((row) => row.email.endsWith('@example.com')), 'a batch hands over addresses');
  check(Number(await one("select count(*) from public.email_recipients where send_id=$1 and status='sending'", [adminSend.id])) === 3, 'and marks them as being sent');
  check((await rows('select * from public.email_claim_batch($1, 3)', [adminSend.id])).length === 1, 'the next batch never repeats them');
  await db.query("select public.email_mark($1,$2,'sent')", [adminSend.id, batch[0].user_id]);
  await db.query("select public.email_mark($1,$2,'failed','Mailbox full')", [adminSend.id, batch[1].user_id]);
  await db.query("select public.email_mark($1,$2,'retry')", [adminSend.id, batch[2].user_id]);
  const statuses = Object.fromEntries((await rows('select user_id, status, error from public.email_recipients where send_id=$1', [adminSend.id])).map((row) => [row.user_id, row]));
  check(statuses[batch[0].user_id].status === 'sent' && statuses[batch[1].user_id].error === 'Mailbox full' && statuses[batch[2].user_id].status === 'waiting', 'sent, failed and back to waiting');
  check(Number(await one('select public.email_sent_today()')) === 2, 'today counts sent and still sending');
  await db.exec('reset role');
  await db.query("update public.email_recipients set claimed_at = now() - interval '11 minutes' where status='sending'");
  await as('service');
  check((await rows('select * from public.email_claim_batch($1, 5)', [adminSend.id])).length === 1, 'the one sent back waits again');
  check(Number(await one("select count(*) from public.email_recipients where error like 'Stopped midway%'")) === 1, 'one stuck midway is marked failed, never sent twice');
  const meera = (await rows('select * from public.email_claim_batch($1, 5)', [thanks.id]))[0];
  check(meera.user_id === id(3) && Number(meera.amount) === 300 && meera.display_name === 'Meera S', 'a thank-you knows what the backer gave (approved claims only)');
  await db.query("select public.email_mark($1,$2,'sent')", [thanks.id, id(3)]);

  // Stop these emails.
  await db.query('select public.email_set_stopped($1, true)', [id(6)]);
  check((await one('select status from public.email_recipients where send_id=$1', [note.id])) === 'failed', 'stopping drops what still waits for them');
  await db.query('select public.email_set_stopped($1, false)', [id(7)]);
  await db.exec('reset role');
  check(Number(await one('select count(*) from public.email_opt_outs where user_id=$1', [id(7)])) === 0, 'and the page can start them again');

  // Owner → Backers.
  await as(1);
  const backers = await one('select public.owner_backers()');
  check(backers.length === 1 && Number(backers[0].total) === 300 && backers[0].claims === 2, 'backers: what each gave, from approved claims');
  check(backers[0].display_name === 'Meera S' && backers[0].thanked_at && backers[0].first_at.startsWith('2026-11-03'), 'with when they joined and when they were thanked');
  await db.exec('reset role');
  await db.query('update public.profiles set is_backer=true where id=$1', [id(4)]);
  await as(1);
  const both = await one('select public.owner_backers()');
  check(both.length === 2 && Number(both[1].total) === 0 && both[1].thanked_at === null, 'a badge given by hand shows with nothing counted');

  // A send's details: names and what happened, never addresses.
  await as(2);
  const detail = await one('select public.admin_email_send_detail($1)', [adminSend.id]);
  check(detail.subject === 'YouDO 9 is here' && detail.sent_by_name === 'Anjali R' && detail.recipients.length === 4, 'a send shows what went and to whom');
  check(detail.recipients[0].status === 'failed' && detail.recipients.every((r) => !('email' in r)), 'didn\'t arrive first, and no addresses');
  check(detail.recipients.some((r) => r.status === 'sent' && r.sent_at), 'with when each arrived');
  await as(4);
  await fails('select public.admin_email_send_detail($1)', [adminSend.id], 'members cannot see a send');

  // Templates.
  await db.exec('reset role');
  check(Number(await one('select count(*) from public.email_templates')) === 2, 'two templates are made the first time (News is retired)');
  await db.exec(await load('admin_email'));
  check(Number(await one('select count(*) from public.email_templates')) === 2, 'running again makes no copies');
  await as(1);
  let templates = await one('select public.admin_email_templates()');
  check(templates.map((t) => t.name).sort().join() === 'Personal note,Thank a backer', 'the owner sees both');
  check(templates.find((t) => t.kind === 'thanks').body.endsWith('believing in YouDO from the start.'), 'the thank-you ends with the new line');
  const made = await one("select public.owner_save_email_template(null, ' Exam week ', 'update', 'Good luck', 'Hi {name}')");
  const thanksTemplate = templates.find((t) => t.kind === 'thanks');
  await db.query("select public.owner_save_email_template($1, 'Thank a backer', 'thanks', 'Thanks!', 'Hi {name}, thank you')", [thanksTemplate.id]);
  templates = await one('select public.admin_email_templates()');
  check(templates.length === 3 && templates.find((t) => t.id === made).name === 'Exam week', 'the owner adds one (name trimmed)');
  check(templates.find((t) => t.id === thanksTemplate.id).subject === 'Thanks!', 'and changes one');
  await fails("select public.owner_save_email_template(null, '', 'note', '', 'x')", [], 'a template needs a name');
  await fails("select public.owner_save_email_template(null, 'x', 'spam', '', 'x')", [], 'and a known kind');
  await fails("select public.owner_save_email_template($1, 'x', 'note', '', 'x')", [id(99)], 'changing a missing template is refused');
  await as(2);
  const adminTemplates = await one('select public.admin_email_templates()');
  check(adminTemplates.length === 2 && !adminTemplates.some((t) => t.kind === 'thanks'), 'admins see them without the thank-you');
  await fails("select public.owner_save_email_template(null, 'Mine', 'note', '', 'x')", [], 'admins cannot add templates');
  await fails('select public.owner_delete_email_template($1)', [made], 'or delete them');
  await fails('select * from public.email_templates', [], 'the table is closed to the app');
  await as(4);
  await fails('select public.admin_email_templates()', [], 'members cannot read templates');
  await as(1);
  await db.query('select public.owner_delete_email_template($1)', [made]);
  check((await one('select public.admin_email_templates()')).length === 2, 'the owner deletes one');

  console.log(`Admin email SQL: ${checks} checks passed.`);
} finally {
  await db.close();
}
