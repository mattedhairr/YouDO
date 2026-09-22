// Isolated PostgreSQL contract tests for managed app quotes.
import { PGlite } from '../node_modules/.cache/community-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();
const id=n=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('set role authenticated');};
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const denied=async(sql,args=[])=>{let failed=false;try{await db.query(sql,args);}catch{failed=true;}check(failed,`Expected denial: ${sql}`);};
try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text unique,created_at timestamptz not null default now(),email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage,select on sequences to authenticated;`);
  await db.exec(`create table public.user_backups(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,backup_data text not null,updated_at timestamptz not null default now(),constraint user_backups_user_id_key unique(user_id));`);
  for(const file of ['user_backups','public_pace','community','app_quotes']){
    await db.exec((await readFile(new URL(`../supabase/${file}.sql`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[id(1),'admin@example.com',id(2),'member@example.com']);
  await db.query('insert into public.community_admins(user_id) values($1)',[id(1)]);
  await db.exec('set role anon');
  check((await rows('select count(*)::int n from public.active_app_quotes()'))[0].n===20,'anonymous app clients receive seeded active quotes');
  await denied('select * from public.app_quotes');
  await as(2);await denied('select * from public.admin_app_quotes()');
  await denied("select public.save_app_quote(null,'A member must not create this quote','Member',true)");
  await as(1);
  check((await rows('select count(*)::int n from public.admin_app_quotes()'))[0].n===20,'admin receives the managed list');
  const created=(await rows("select public.save_app_quote(null,'A newly managed preparation quote','YouDO',true) id"))[0].id;
  await rows("select public.save_app_quote($1,'An edited preparation quote','Coach',false)",[created]);
  check((await rows('select active from public.admin_app_quotes() where id=$1',[created]))[0].active===false,'admin edits and hides a quote');
  await rows('select public.delete_app_quote($1)',[created]);
  check((await rows('select count(*)::int n from public.admin_app_quotes()'))[0].n===20,'admin permanently deletes a quote');
  const seeded=(await rows('select id from public.admin_app_quotes() order by sort_order limit 1'))[0].id;
  await rows('select public.delete_app_quote($1)',[seeded]);
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/app_quotes.sql',import.meta.url),'utf8'));
  await as(1);
  check((await rows('select count(*)::int n from public.admin_app_quotes()'))[0].n===19,'rerunning the migration does not restore an admin-deleted default');
  console.log(`${checks} app quote SQL checks passed.`);
}finally{await db.close();}
