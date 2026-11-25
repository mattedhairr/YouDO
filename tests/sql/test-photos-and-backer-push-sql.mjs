// Isolated PostgreSQL checks for profile_photos.sql (your own photo in Storage,
// and an admin taking one down) and backer_push.sql (the owner's push for a new
// backer claim). Every person here is made up.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
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
const sent = async () => rows('select body from net.calls order by id');
const clear = () => db.exec('delete from net.calls');

try {
  const harness = (await readFile(new URL('./test-full-setup-sql.mjs', import.meta.url), 'utf8')).match(/await db\.exec\(`([\s\S]*?)`\);/)[1]
    .replace(/create function net\.http_post[\s\S]*?\$\$select 1::bigint\$\$;/, '');
  await db.exec(harness);
  await db.exec(`create table net.calls(id serial primary key, body jsonb);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$insert into net.calls(body) values(body) returning id$$;`);
  const load = async (name) => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const name of SUPABASE_SETUP_ORDER) await db.exec(await load(name));
  check(SUPABASE_SETUP_ORDER.includes('profile_photos') && SUPABASE_SETUP_ORDER.includes('backer_push'), 'both files are part of the full setup');
  await db.exec(await load('profile_photos'));
  await db.exec(await load('backer_push'));
  check(true, 'both files run again on a full project');
  await db.query("insert into vault.decrypted_secrets values('project_url','https://example.supabase.co'),('push_webhook_secret',$1) on conflict do nothing", ['s'.repeat(64)]);

  // 1 owner, 2 admin, 3 Meera, 4 Ravi.
  const people = ['owner_demo', 'anjali_r', 'meera_s', 'ravi_k'];
  for (let n = 1; n <= people.length; n++) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id(n), `${people[n - 1]}@example.com`, { avatar_url: `https://example.supabase.co/storage/v1/object/public/avatars/${id(n)}/1.webp` }]);
    await db.query('insert into public.profiles(id,username,display_name,avatar_url) values($1,$2,$3,$4) on conflict (id) do update set username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url',
      [id(n), people[n - 1], people[n - 1], `https://example.supabase.co/storage/v1/object/public/avatars/${id(n)}/1.webp`]);
  }
  await db.query("insert into public.community_admins(user_id,role) values($1,'owner'),($2,'admin')", [id(1), id(2)]);

  // ---- Profile photos ----
  const bucket = (await rows("select * from storage.buckets where id='avatars'"))[0];
  check(bucket?.public === true, 'the avatars bucket is public, so pictures load like any image');
  check(Number(bucket.file_size_limit) === 262144 && bucket.allowed_mime_types.join() === 'image/webp,image/jpeg,image/png', 'it takes only small images');

  await as(3);
  await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)", [`${id(3)}/2.webp`]);
  check(Number(await one("select count(*) from storage.objects where name like $1", [`${id(3)}/%`])) === 1, 'you can upload into your own folder');
  await fails("insert into storage.objects(bucket_id,name) values('avatars',$1)", [`${id(4)}/evil.webp`], 'you cannot upload into someone else\'s folder');
  await fails("insert into storage.objects(bucket_id,name) values('avatars','loose.webp')", [], 'or outside any folder');
  await as(4);
  await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)", [`${id(4)}/1.webp`]);
  check(Number(await one("select count(*) from storage.objects")) === 1, 'you list only your own files');
  await db.query("delete from storage.objects where name like $1", [`${id(3)}/%`]);
  await as(3);
  check(Number(await one("select count(*) from storage.objects")) === 1, 'nobody else can delete your files');
  await db.query("update storage.objects set name=$1 where name like $2", [`${id(3)}/3.webp`, `${id(3)}/%`]);
  check((await one('select name from storage.objects')) === `${id(3)}/3.webp`, 'you can replace your own file');
  await db.query("delete from storage.objects where name like $1", [`${id(3)}/%`]);
  check(Number(await one('select count(*) from storage.objects')) === 0, 'and delete it');

  // An admin takes a photo down.
  await fails('select public.admin_remove_profile_photo($1)', [id(4)], 'a member cannot take down a photo');
  await as(0);
  await fails('select public.admin_remove_profile_photo($1)', [id(4)], 'nor can a signed-out visitor');
  await as(2);
  await db.query('select public.admin_remove_profile_photo($1)', [id(4)]);
  await db.exec('reset role');
  check((await one('select avatar_url from public.profiles where id=$1', [id(4)])) === '🎓', 'the profile goes back to the emoji');
  check((await one("select raw_user_meta_data->>'avatar_url' from auth.users where id=$1", [id(4)])) === '🎓', 'and so does the account, so it does not come back at sign-in');
  check(Number(await one("select count(*) from public.community_audit_log where action='photo.removed' and admin_id=$1 and target_user_id=$2", [id(2), id(4)])) === 1, 'the log says who took it down');
  check((await one('select avatar_url from public.profiles where id=$1', [id(3)])).startsWith('https://'), 'nobody else\'s photo changes');
  await as(2);
  await fails('select public.admin_remove_profile_photo($1)', [id(1)], 'an admin cannot take down the owner\'s photo');
  await as(1);
  await db.query('select public.admin_remove_profile_photo($1)', [id(3)]);
  await db.exec('reset role');
  check((await one('select avatar_url from public.profiles where id=$1', [id(3)])) === '🎓', 'the owner can take one down too');
  await db.query("update public.profiles set avatar_url='🦉' where id=$1", [id(2)]);
  await as(1);
  await db.query('select public.admin_remove_profile_photo($1)', [id(2)]);
  await db.exec('reset role');
  check((await one('select avatar_url from public.profiles where id=$1', [id(2)])) === '🦉', 'an emoji is left alone');

  // ---- Backer claim push ----
  check((await one("select column_default from information_schema.columns where table_name='push_preferences' and column_name='admin_backers'")) === 'true', 'the switch is on by default');
  check((await one("select private.backer_amount(50, 'INR')")) === '₹50', '₹50');
  check((await one("select private.backer_amount(50.5, 'INR')")) === '₹50.5', '₹50.5');
  check((await one("select private.backer_amount(100, 'inr')")) === '₹100', '₹100 keeps its zeros');
  check((await one("select private.backer_amount(12, 'usd')")) === 'USD 12', 'other currencies by their code');

  await clear();
  await db.query("insert into public.hub_backers(user_id,username,amount,utr) values($1,'meera_s',50,'133224720400')", [id(3)]);
  let calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.join() === id(1), 'a new claim pushes to the owner only');
  check(calls[0].body.title === 'New backer claim' && calls[0].body.body === '@meera_s says they sent ₹50. Check your UPI app, then approve it in Admin Hub.', 'it says who and how much');
  check(!JSON.stringify(calls[0].body).includes('133224720400'), 'the UTR never goes in the push');
  check(calls[0].body.data.type === 'admin_backer' && calls[0].body.data.channel === 'admin-hub' && calls[0].body.data.tag === 'admin-backers', 'it opens the Admin Hub');

  await clear();
  await db.query("insert into public.hub_backers(user_id,username,amount,status) values($1,'ravi_k',50,'verified')", [id(4)]);
  check((await sent()).length === 0, 'a claim saved as already checked does not push');
  await db.query("insert into public.hub_backers(user_id,username,amount) values($1,'owner_demo',50)", [id(1)]);
  check((await sent()).length === 0, 'the owner\'s own claim does not push to them');
  await db.query("insert into public.hub_backers(user_id,username,amount) values(null,null,75)");
  calls = await sent();
  check(calls.length === 1 && calls[0].body.body.startsWith('Someone says they sent ₹75'), 'a claim with no account still reaches the owner');

  await clear();
  await db.query('insert into public.push_preferences(user_id,admin_backers) values($1,false) on conflict (user_id) do update set admin_backers=false', [id(1)]);
  await db.query("insert into public.hub_backers(user_id,username,amount) values($1,'ravi_k',50)", [id(4)]);
  check((await sent()).length === 0, 'with the switch off, nothing is pushed');
  check(Number(await one("select count(*) from public.hub_backers where username='ravi_k' and status='pending'")) === 1, 'and the claim is still saved');

  console.log(`Photos and backer push SQL: ${checks} checks passed.`);
} finally {
  await db.close();
}
