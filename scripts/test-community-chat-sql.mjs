// Isolated PostgreSQL contract tests. See test-community-sql.mjs for runtime setup.
import { PGlite } from '../node_modules/.cache/community-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
const as = async n => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : '']); await db.exec('set role authenticated'); };
const asSystem = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); };
let checks=0;
const check = (ok,label) => { assert.ok(ok,label); checks++; };
const denied = async (sql,args=[]) => { let error=false; try { await db.query(sql,args); } catch { error=true; } check(error,`Expected denial: ${sql}`); };
const state = async () => (await rows('select public.community_chat_state() as s'))[0].s;
const send = async (n,body,reply=null,author=null) => (await rows('select public.send_community_message($1,$2,$3,$4) as m',[id(1000+n),body,reply,author ? id(author) : null]))[0].m;
try {
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(
      id uuid primary key,
      email text unique,
      created_at timestamptz not null default now(),
      email_confirmed_at timestamptz,
      last_sign_in_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage,select on sequences to authenticated;`);
  for (const file of ['user_backups','public_pace','community']) await db.exec((await readFile(new URL(`../supabase/${file}.sql`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  for(let n=1;n<=14;n++) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`member${n}@example.com`]);
    await db.query('insert into public.public_pace(user_id,display_name) values($1,$2)',[id(n),`Member ${n}`]);
  }
  await db.query("insert into public.user_backups(user_id,backup_data,updated_at) values($1,'{}',now()+interval '1 minute')",[id(2)]);
  await db.query('insert into public.community_admins(user_id) values($1)',[id(1)]);
  await as(2); await db.query("select public.post_community_message('Before upgrade')");
  await asSystem();
  const fanout=(await rows('select count(*)::int n from public.community_deliveries'))[0].n;
  check(fanout===14,'baseline allocates fourteen delivery rows per message');
  const sql=await readFile(new URL('../supabase/community_chat.sql',import.meta.url),'utf8');
  await db.exec(sql);
  await db.exec(await readFile(new URL('../supabase/operations/manage_community_staff.sql',import.meta.url),'utf8'));
  check(true,'private staff-management query parses without changing its default inspect target');
  const usage=await rows(await readFile(new URL('../supabase/operations/inspect_app_usage.sql',import.meta.url),'utf8'));
  check(usage.length===15 && usage[0].row_type==='SUMMARY' && usage[0].total_accounts==='14' && usage[0].accounts_with_cloud_backup==='1' &&
    usage[1].row_type==='ACCOUNT' && usage[1].email==='member2@example.com' && usage[1].total_accounts==='' &&
    usage.every(row=>Object.values(row).every(value=>value!==null)),
    'private app-usage diagnostic returns one summary then newest-first accounts without NULL display cells');
  await asSystem(); await rows("select public.set_community_staff('member1@example.com','owner',true)");
  await rows("select public.set_community_staff('member1@example.com','owner',true)");
  await db.exec(sql); check(true,'upgrade is rerunnable and preserves configured staff');
  check((await rows("select count(*)::int n from public.community_admins where role='owner'"))[0].n===1,'repeating owner bootstrap preserves exactly one owner row');
  await denied("select public.set_community_staff('member2@example.com','owner',true)");
  await as(1); await rows("select public.set_community_staff('member6@example.com','admin',true)");
  await rows("select public.set_community_staff('member6@example.com','admin',false)");
  await asSystem();
  check((await rows('select count(*)::int n from public.community_admins where user_id=$1',[id(6)]))[0].n===1,'rerunning staff assignment updates one row');
  await as(3); let context=(await rows('select public.community_context() as c'))[0].c;
  check(context.staff_ids.includes(id(1)) && !context.staff_ids.includes(id(6)),'badge visibility does not remove moderation permission');
  await as(6); await denied("select public.set_community_staff('member7@example.com','admin',true)");
  await denied("select public.remove_community_staff('member1@example.com')");
  await as(1); await rows("select public.remove_community_staff('member6@example.com')");
  await rows("select public.set_community_staff('member6@example.com','admin',true)");
  await as(3); check((await state()).chat===0 && (await state()).updates===0,'migration does not mark history or an old broadcast unread');
  check((await rows('select * from public.community_inbox()')).length===1,'legacy history stays visible');
  context=(await rows('select public.community_context() as c'))[0].c;
  check(context.staff_ids.includes(id(1)) && context.staff_ids.includes(id(6)) && !('is_owner' in context),'staff share one public identity without exposing the owner');
  await as(1); await rows("select public.set_community_settings(true,true,'Exam notice')");
  check((await state()).updates===0,'the broadcast publisher is not notified about their own update');
  await as(3); check((await state()).updates===1,'a new broadcast creates an Updates dot');
  await rows('select * from public.community_chat_page()');
  check((await state()).updates===1,'fetching Chat does not mark a broadcast read');
  await rows('select public.read_community_updates()');
  check((await state()).updates===0,'displaying Updates clears only its own read state');
  await as(1); await rows("select public.set_community_settings(true,true,'Exam notice revised')");
  await as(3); check((await state()).updates===1,'editing a broadcast creates a fresh Updates dot');
  await as(2);
  await denied('select public.send_community_message($1,$2,null,$3)',[id(4000),'Wrong account',id(3)]);
  const first=await send(1,'Revision started',null,2);
  const retried=await send(1,'Revision started',null,2);
  check(first.id===retried.id,'retry keeps the same identity');
  check((await rows('select * from public.community_chat_page()')).length===2,'retry creates only one row');
  await as(3);
  check((await state()).chat===1,'new messages create a Chat dot');
  await rows('select * from public.community_chat_page()');
  check((await state()).chat===1,'fetching is not reading');
  await denied('select public.edit_community_message($1,$2)',[first.id,'Forged edit']);
  await denied('select public.delete_community_message($1)',[first.id]);
  await denied('select public.send_community_message($1,$2)',[first.id,'Stolen identity']);
  await rows('select public.read_community_messages($1)',[[first.id]]);
  check((await state()).chat===0 && (await state()).updates===1,'reading Chat preserves the separate Updates dot');
  await rows('select public.report_community_message($1,$2)',[first.id,'Needs review']);
  await rows('select public.report_community_message($1,$2)',[first.id,'Needs review']);
  check((await rows('select count(*)::int n from public.community_reports where message_id=$1',[first.id]))[0].n===1,'report retries do not duplicate the queue');
  await as(2);
  await denied('select public.report_community_message($1)',[first.id]);
  const edited=(await rows('select public.edit_community_message($1,$2) as m',[first.id,'Revision completed']))[0].m;
  check(edited.body==='Revision completed' && edited.edited_at,'edit carries server label');
  await denied('update public.community_messages set body=$1 where id=$2',['Direct write',first.id]);
  await denied('select * from public.community_read_state');
  await as(4); const reply=await send(2,'Well done',first.id);
  await as(2); check((await state()).chat===1,'a reply contributes to Chat activity');
  await as(4); await rows('select public.delete_community_message($1)',[reply.id]);
  await as(2); check((await state()).chat===0,'deletion clears stale unread activity');
  await db.exec('reset role');
  check((await rows('select count(*)::int n from public.community_deliveries'))[0].n===fanout,'new messages add no per-member delivery rows');
  await db.query("update public.community_messages set created_at=now()-interval '16 minutes' where id=$1",[first.id]);
  await as(2); await denied('select public.edit_community_message($1,$2)',[first.id,'Too late']);
  await denied('select public.delete_community_message($1)',[first.id]);
  await db.exec('reset role');
  for(let n=1;n<=125;n++) await db.query("insert into public.community_messages(author_id,body) values($1,$2)",[id(5),`Pagination ${n}`]);
  await as(3); const page=await rows('select * from public.community_chat_page()');
  check(page.length===30,'page is limited to thirty');
  const second=await rows('select * from public.community_chat_page($1)',[page.at(-1).sequence]);
  check(second.length===30 && !second.some(m=>page.some(p=>m.id===p.id)),'exclusive cursor does not duplicate a page');
  let all=[...page,...second],cursor=second.at(-1).sequence;
  for(let n=0;n<4;n++){const next=await rows('select * from public.community_chat_page($1)',[cursor]); if(!next.length)break; all.push(...next);cursor=next.at(-1).sequence;}
  check(all.length===120,'history ceiling is preserved');
  await denied('select public.remove_community_message($1,$2)',[first.id,'Unauthorized']);
  await as(1);
  await denied('select public.remove_community_message($1,$2)',[first.id,'']);
  await rows('select public.remove_community_message($1,$2)',[first.id,'Off-topic message']);
  await rows('select public.remove_community_message($1,$2)',[first.id,'Off-topic message']);
  await db.exec('reset role');
  check((await rows("select count(*)::int n from public.community_audit_log where message_id=$1 and action='message.removed'",[first.id]))[0].n===1,'moderation retries leave one audit record');
  check((await rows('select reason from public.community_audit_log where message_id=$1',[first.id]))[0].reason==='Off-topic message','moderation reason is recorded');
  await as(1); await denied('select public.remove_community_message($1,$2)',[id(9999),'No such message']);
  await as(1); await rows('select public.moderate_community_member($1,$2)',[id(3),'ban']);
  await as(3); check((await rows('select * from public.community_chat_page()')).length===0,'banned users cannot browse');
  check((await state()).chat===0,'banned user has no stale badge');
  await denied('select public.send_community_message($1,$2)',[id(3000),'Bypass ban']);
  await as(1); await rows('select public.moderate_community_member($1,$2)',[id(3),'restore']);
  await as(3); await rows('delete from public.public_pace where user_id=auth.uid()');
  check((await rows('select * from public.community_chat_page()')).length===0,'leaving Board removes access');
  await rows("insert into public.public_pace(user_id,display_name) values(auth.uid(),'Rejoined')");
  check((await state()).chat===0,'rejoining does not revive old unread');
  check((await rows('select * from public.community_chat_page()')).length===0,'new membership does not inherit former messages');
  await db.exec('reset role; set role anon');
  await denied('select * from public.community_chat_page()');
  await denied('select public.community_chat_state()');
  console.log(`${checks} chat SQL checks passed. Baseline delivery fan-out: ${fanout}/message; upgraded: 0/message.`);
} finally { await db.close(); }
