// Isolated PostgreSQL contract tests for the admin's Support settings.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();
const id=n=>`40000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec(n?'set role authenticated':'set role anon');};
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const denied=async(sql,args=[])=>{let failed=false;try{await db.query(sql,args);}catch{failed=true;}check(failed,`Expected denial: ${sql}`);};
const load=async file=>(await readFile(new URL(`../../supabase/${file}.sql`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
const claim="select public.submit_hub_backer(50,'123456789012',null,'member')";
try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text unique,created_at timestamptz not null default now(),email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage,select on sequences to authenticated;`);
  await db.exec(`create table public.user_backups(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,backup_data text not null,updated_at timestamptz not null default now(),constraint user_backups_user_id_key unique(user_id));`);
  for(const file of ['user_backups','public_pace','community'])await db.exec(await load(file));
  // hub_backers.sql's badge flags need the Private Hub profiles table.
  await db.exec(`create table if not exists public.profiles(id uuid primary key references auth.users(id),username text,display_name text,is_backer boolean default false,backer_tier text,bio text);`);
  for(const file of ['hub_backers','support_settings'])await db.exec(await load(file));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[id(1),'admin@example.com',id(2),'member@example.com']);
  await db.query('insert into public.community_admins(user_id) values($1)',[id(1)]);

  await as(0);
  const first=(await rows('select public.support_settings() s'))[0].s;
  check(first.upiId==='mattedhairr@axl'&&first.supportEnabled&&first.qrEnabled&&first.claimsEnabled,'signed-out apps read the default settings');
  await denied('select * from public.app_support_settings');

  await as(2);
  await denied("select public.save_support_settings(true,'other@bank',true,true)");
  check((await rows(claim))[0].submit_hub_backer.success===true,'claims are accepted while open');

  await as(1);
  await denied("select public.save_support_settings(true,'not an id',true,true)");
  const saved=(await rows("select public.save_support_settings(true,' study.fund@okaxis ',false,false) s"))[0].s;
  check(saved.upiId==='study.fund@okaxis'&&saved.qrEnabled===false&&saved.claimsEnabled===false,'the admin saves a trimmed UPI ID and the switches');
  check((await rows("select count(*)::int n from public.community_audit_log where action='support.updated'"))[0].n===1,'the change is in the admin log');

  await as(2);
  await denied(claim);
  await denied("insert into public.hub_backers(user_id,amount,utr) values(auth.uid(),50,'123456789013')");
  check((await rows('select public.support_settings() s'))[0].s.upiId==='study.fund@okaxis','members see the new UPI ID');

  await db.exec('reset role');
  await db.exec(await load('support_settings'));
  await as(0);
  const again=(await rows('select public.support_settings() s'))[0].s;
  check(again.upiId==='study.fund@okaxis'&&again.claimsEnabled===false,'rerunning the migration keeps the saved settings');
  await db.exec('reset role');
  check((await rows('select count(*)::int n from public.hub_backers'))[0].n===1,'the claim made while open is kept');
  console.log(`${checks} support settings SQL checks passed.`);
}finally{await db.close();}
