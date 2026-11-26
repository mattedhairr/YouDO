-- Admin Hub → People → Email, and Owner → Backers. Safe to re-run; apply after
-- admin_hub.sql (scripts/supabase-setup-order.mjs).
--
-- Emails go out through the admin-email edge function, from YouDO's own Gmail
-- (its app password is a Supabase secret), a few at a time, so Gmail's daily
-- limit is respected and a closed screen can carry on later. This file decides
-- who gets each email and keeps the record; the function only sends.
--
-- Who may do what:
-- - Admins and the owner: write to everyone or to people they pick, see the
--   sends so far and send the rest. Admins never see an email address: the
--   function looks them up with the service key.
-- - The owner only: write to backers, thank-yous ({amount}), and Backers.
-- Everyone can stop these emails from the link at the bottom of each one
-- (email_opt_outs). Sign-in mails (confirm, reset) are separate and unaffected.
-- Templates (email_templates): the owner writes and edits them in the app;
-- admins can start from them (never a thank-you).

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('update', 'thanks', 'note')),
  audience text not null check (audience in ('everyone', 'backers', 'people')),
  subject text not null,
  body text not null,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.email_recipients (
  send_id uuid not null references public.email_sends (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'sending', 'sent', 'failed')),
  claimed_at timestamptz,
  sent_at timestamptz,
  error text,
  primary key (send_id, user_id)
);
create index if not exists email_recipients_sent on public.email_recipients (sent_at) where status = 'sent';
create index if not exists email_recipients_user on public.email_recipients (user_id);

create table if not exists public.email_opt_outs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.email_sends enable row level security;
alter table public.email_recipients enable row level security;
alter table public.email_opt_outs enable row level security;
revoke all on public.email_sends, public.email_recipients, public.email_opt_outs from public, anon, authenticated;
-- The edge function reads a send's progress with the service key.
grant select on public.email_recipients to service_role;

-- Gmail allows about 500 a day; YouDO keeps a margin for tests and retries.
create or replace function public.email_daily_limit()
returns integer language sql immutable set search_path = '' as $$ select 450 $$;

create or replace function public.email_sent_today()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.email_recipients r
  where r.status in ('sent', 'sending') and coalesce(r.sent_at, r.claimed_at) > pg_catalog.now() - interval '24 hours';
$$;

-- What a backer gave: their approved claims added up.
create or replace function public.backer_totals()
returns table (user_id uuid, total numeric, claims integer, first_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.user_id, sum(b.amount), count(*)::int, min(b.created_at)
  from public.hub_backers b
  where b.user_id is not null and b.status in ('verified', 'featured')
  group by b.user_id;
$$;

-- Everyone a send may reach: confirmed, not stopped, and (except when picked
-- by hand) not banned from the community.
create or replace function public.email_audience(audience text, chosen uuid[])
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.community_members cm on cm.user_id = u.id
  where u.email is not null and u.email_confirmed_at is not null
    and not exists (select 1 from public.email_opt_outs o where o.user_id = u.id)
    and case audience
      when 'everyone' then cm.banned_at is null
      when 'backers' then cm.banned_at is null
        and (coalesce(p.is_backer, false) or exists (select 1 from public.backer_totals() t where t.user_id = u.id))
      when 'people' then u.id = any(coalesce(chosen, '{}'))
      else false end;
$$;

-- The Email screen: today's room under the limit, who each audience reaches,
-- and the sends so far.
create or replace function public.admin_email_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_view boolean := public.is_community_owner();
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'limit', public.email_daily_limit(),
    'sent_today', public.email_sent_today(),
    'everyone', (select count(*) from public.email_audience('everyone', null)),
    'backers', case when owner_view then (select count(*) from public.email_audience('backers', null)) end,
    'stopped', (select count(*) from public.email_opt_outs),
    'sends', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select s.id, s.kind, s.audience, s.subject, s.created_at, s.sent_by,
          coalesce(nullif(p.display_name, ''), p.username) as sent_by_name,
          (select count(*) from public.email_recipients r where r.send_id = s.id) as total,
          (select count(*) from public.email_recipients r where r.send_id = s.id and r.status = 'sent') as sent,
          (select count(*) from public.email_recipients r where r.send_id = s.id and r.status = 'failed') as failed,
          (select count(*) from public.email_recipients r where r.send_id = s.id and r.status in ('waiting', 'sending')) as waiting
        from public.email_sends s
        left join public.profiles p on p.id = s.sent_by
        order by s.created_at desc limit 50
      ) x), '[]'::jsonb)
  );
end; $$;

-- How many of the picked people an email can reach (some may be unconfirmed or stopped).
create or replace function public.admin_email_reach(chosen uuid[])
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  return (select count(*)::int from public.email_audience('people', chosen[1:50]));
end; $$;

-- Writes a send and its recipients; the edge function then sends them.
create or replace function public.admin_email_create(
  email_kind text, email_audience text, chosen uuid[], email_subject text, email_body text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_view boolean := public.is_community_owner();
declare new_id uuid;
declare reached integer;
declare picked uuid[] := coalesce(chosen, '{}');
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  if email_kind not in ('update', 'thanks', 'note') then raise exception 'Unknown kind'; end if;
  if email_audience not in ('everyone', 'backers', 'people') then raise exception 'Unknown audience'; end if;
  if (email_audience = 'backers' or email_kind = 'thanks') and not owner_view then
    raise exception 'Backers and thank-yous are the owner''s' using errcode = '42501';
  end if;
  if email_audience = 'people' and (pg_catalog.cardinality(picked) = 0 or pg_catalog.cardinality(picked) > 50) then
    raise exception 'Pick 1 to 50 people';
  end if;
  if pg_catalog.btrim(coalesce(email_subject, '')) = '' or pg_catalog.length(email_subject) > 120 then raise exception 'Subject must be 1 to 120 characters'; end if;
  if pg_catalog.btrim(coalesce(email_body, '')) = '' or pg_catalog.length(email_body) > 6000 then raise exception 'Message must be 1 to 6000 characters'; end if;

  insert into public.email_sends (sent_by, kind, audience, subject, body)
  values (auth.uid(), email_kind, email_audience, pg_catalog.btrim(email_subject), email_body)
  returning id into new_id;
  insert into public.email_recipients (send_id, user_id)
  select new_id, a.user_id from public.email_audience(email_audience, picked) a;
  get diagnostics reached = row_count;
  if reached = 0 then
    delete from public.email_sends where id = new_id;
    raise exception 'No one to send to: they may not have confirmed their email, or stopped these emails';
  end if;

  insert into public.community_audit_log (admin_id, action, target_user_id, reason)
  values (auth.uid(), 'email.sent', case when reached = 1 then (select r.user_id from public.email_recipients r where r.send_id = new_id) end,
    pg_catalog.left(pg_catalog.btrim(email_subject), 120) || ' · ' || reached || case when reached = 1 then ' person' else ' people' end);
  return jsonb_build_object('id', new_id, 'total', reached);
end; $$;

-- Asked by the edge function as the signed-in person before sending: may they
-- send this one, how many may go today, and whose name signs a note.
create or replace function public.admin_email_may_send(send uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare found public.email_sends;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  select * into found from public.email_sends s where s.id = send;
  if found.id is null then raise exception 'Email not found'; end if;
  if found.sent_by is distinct from auth.uid() and not public.is_community_owner() then
    raise exception 'Only who wrote it, or the owner, can send the rest' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'left_today', greatest(public.email_daily_limit() - public.email_sent_today(), 0),
    'kind', found.kind, 'subject', found.subject, 'body', found.body,
    'signer', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = found.sent_by));
end; $$;

-- For "Send me a test": the caller's own address and name. Only their own.
create or replace function public.admin_email_self()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  return (select jsonb_build_object('user_id', u.id, 'email', u.email,
      'name', coalesce(nullif(p.display_name, ''), p.username), 'amount', t.total,
      'left_today', greatest(public.email_daily_limit() - public.email_sent_today(), 0))
    from auth.users u left join public.profiles p on p.id = u.id
    left join public.backer_totals() t on t.user_id = u.id
    where u.id = auth.uid());
end; $$;

-- The edge function's next few: marks them as being sent and hands over their
-- address, name and (for thank-yous) amount. Service key only. A row stuck in
-- 'sending' for 10 minutes (the function stopped) is marked failed, never sent twice.
create or replace function public.email_claim_batch(send uuid, batch_size integer)
returns table (user_id uuid, email text, display_name text, amount numeric)
language plpgsql security definer set search_path = '' as $$
begin
  update public.email_recipients r set status = 'failed', error = 'Stopped midway; it may not have arrived.'
  where r.send_id = send and r.status = 'sending' and r.claimed_at < pg_catalog.now() - interval '10 minutes';
  return query
  with picked as (
    select r.user_id from public.email_recipients r
    where r.send_id = send and r.status = 'waiting'
    order by r.user_id
    limit greatest(least(coalesce(batch_size, 0), 20), 0)
    for update skip locked
  ), claimed as (
    update public.email_recipients r set status = 'sending', claimed_at = pg_catalog.now()
    from picked where r.send_id = send and r.user_id = picked.user_id
    returning r.user_id
  )
  select c.user_id, u.email::text,
    coalesce(nullif(p.display_name, ''), nullif(pp.display_name, ''), nullif(cm.display_name, '')),
    t.total
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  left join public.public_pace pp on pp.user_id = c.user_id
  left join public.community_members cm on cm.user_id = c.user_id
  left join public.backer_totals() t on t.user_id = c.user_id;
end; $$;

-- After each email: sent, failed (with why), or back to waiting (Gmail refused
-- the login, so nothing went). Service key only.
create or replace function public.email_mark(send uuid, person uuid, outcome text, why text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.email_recipients r set
    status = case outcome when 'sent' then 'sent' when 'retry' then 'waiting' else 'failed' end,
    sent_at = case when outcome = 'sent' then pg_catalog.now() end,
    claimed_at = case when outcome = 'retry' then null else r.claimed_at end,
    error = case when outcome = 'failed' then pg_catalog.left(coalesce(why, 'Not sent'), 300) end
  where r.send_id = send and r.user_id = person and r.status = 'sending';
end; $$;

-- The link at the bottom of each email (checked by the email-stop function). Service key only.
create or replace function public.email_set_stopped(person uuid, stopped boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if stopped then
    insert into public.email_opt_outs (user_id) select person where exists (select 1 from auth.users where id = person)
      on conflict (user_id) do nothing;
    -- Anything still waiting for them is dropped.
    update public.email_recipients set status = 'failed', error = 'They stopped these emails.'
      where user_id = person and status = 'waiting';
  else
    delete from public.email_opt_outs where user_id = person;
  end if;
end; $$;

-- Owner → Backers: everyone with the Founding Backer badge, what they gave and
-- when they were last thanked by email.
create or replace function public.owner_backers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.total desc nulls last, x.first_at) from (
      select u.id as user_id, p.username,
        coalesce(nullif(p.display_name, ''), nullif(pp.display_name, ''), nullif(cm.display_name, '')) as display_name,
        p.avatar_url, coalesce(t.total, 0) as total, coalesce(t.claims, 0) as claims, t.first_at,
        (select max(r.sent_at) from public.email_recipients r join public.email_sends s on s.id = r.send_id
          where r.user_id = u.id and r.status = 'sent' and s.kind = 'thanks') as thanked_at,
        exists (select 1 from public.email_opt_outs o where o.user_id = u.id) as stopped,
        u.email_confirmed_at is not null as confirmed
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.public_pace pp on pp.user_id = u.id
      left join public.community_members cm on cm.user_id = u.id
      left join public.backer_totals() t on t.user_id = u.id
      where coalesce(p.is_backer, false) or t.user_id is not null
    ) x), '[]'::jsonb);
end; $$;

-- One send in full, for the Sent list: what was sent and who got it, who is
-- still waiting and why any didn't arrive. Names only, never addresses.
create or replace function public.admin_email_send_detail(send uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare found public.email_sends;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  select * into found from public.email_sends s where s.id = send;
  if found.id is null then raise exception 'Email not found'; end if;
  return jsonb_build_object(
    'id', found.id, 'kind', found.kind, 'audience', found.audience, 'subject', found.subject, 'body', found.body,
    'created_at', found.created_at, 'sent_by', found.sent_by,
    'sent_by_name', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = found.sent_by),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
          'user_id', r.user_id, 'username', p.username,
          'name', coalesce(nullif(p.display_name, ''), nullif(pp.display_name, ''), nullif(cm.display_name, '')),
          'status', r.status, 'sent_at', r.sent_at, 'error', r.error)
        order by case r.status when 'failed' then 0 when 'waiting' then 1 when 'sending' then 1 else 2 end, r.sent_at desc nulls last)
      from public.email_recipients r
      left join public.profiles p on p.id = r.user_id
      left join public.public_pace pp on pp.user_id = r.user_id
      left join public.community_members cm on cm.user_id = r.user_id
      where r.send_id = found.id), '[]'::jsonb));
end; $$;

-- Saved texts to start an email from. The first two are made once, when
-- the table is empty; after that they are the owner's to change or delete.
-- ('update', News, is retired in the app but stays allowed for older rows.)
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 60),
  kind text not null check (kind in ('update', 'thanks', 'note')),
  subject text not null default '' check (pg_catalog.char_length(subject) <= 120),
  body text not null check (pg_catalog.char_length(body) <= 6000),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table public.email_templates enable row level security;
revoke all on public.email_templates from public, anon, authenticated;

insert into public.email_templates (name, kind, subject, body)
select v.name, v.kind, v.subject, v.body from (values
  (1, 'Thank a backer', 'thanks', 'Thank you for backing YouDO',
    E'Hi {name},\n\nThank you for backing YouDO. You are one of the very first people to do it, and that means a lot.\n\nYour {amount} helps keep YouDO free, ad-free and growing, and your Founding Backer ring now shows around your picture everywhere in the app.\n\nThank you for believing in YouDO from the start.'),
  (2, 'Personal note', 'note', '', E'Hi {name},\n\n')
) as v(position, name, kind, subject, body)
where not exists (select 1 from public.email_templates)
order by v.position;

-- The templates the caller may start from: all for the owner, no thank-yous for admins.
create or replace function public.admin_email_templates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_view boolean := public.is_community_owner();
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'subject', t.subject, 'body', t.body, 'updated_at', t.updated_at)
      order by t.created_at, t.name)
    from public.email_templates t where owner_view or t.kind <> 'thanks'), '[]'::jsonb);
end; $$;

-- Adds a template (no id) or changes one. The owner only.
create or replace function public.owner_save_email_template(
  template_id uuid, template_name text, template_kind text, template_subject text, template_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  if pg_catalog.btrim(coalesce(template_name, '')) = '' or pg_catalog.char_length(pg_catalog.btrim(template_name)) > 60 then raise exception 'Name must be 1 to 60 characters'; end if;
  if template_kind not in ('update', 'thanks', 'note') then raise exception 'Unknown kind'; end if;
  if pg_catalog.char_length(coalesce(template_subject, '')) > 120 then raise exception 'Subject must be up to 120 characters'; end if;
  if pg_catalog.char_length(coalesce(template_body, '')) > 6000 then raise exception 'Message must be up to 6000 characters'; end if;
  if template_id is null then
    insert into public.email_templates (name, kind, subject, body, updated_by)
    values (pg_catalog.btrim(template_name), template_kind, pg_catalog.btrim(coalesce(template_subject, '')), coalesce(template_body, ''), auth.uid())
    returning id into saved;
  else
    update public.email_templates set name = pg_catalog.btrim(template_name), kind = template_kind,
      subject = pg_catalog.btrim(coalesce(template_subject, '')), body = coalesce(template_body, ''),
      updated_by = auth.uid(), updated_at = pg_catalog.now()
    where id = template_id returning id into saved;
    if saved is null then raise exception 'Template not found'; end if;
  end if;
  return saved;
end; $$;

create or replace function public.owner_delete_email_template(template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  delete from public.email_templates where id = template_id;
end; $$;

revoke execute on function public.email_daily_limit() from public, anon;
revoke execute on function public.email_sent_today() from public, anon, authenticated;
revoke execute on function public.backer_totals() from public, anon, authenticated;
revoke execute on function public.email_audience(text, uuid[]) from public, anon, authenticated;
revoke execute on function public.admin_email_overview() from public, anon;
revoke execute on function public.admin_email_reach(uuid[]) from public, anon;
revoke execute on function public.admin_email_create(text, text, uuid[], text, text) from public, anon;
revoke execute on function public.admin_email_may_send(uuid) from public, anon;
revoke execute on function public.admin_email_self() from public, anon;
revoke execute on function public.email_claim_batch(uuid, integer) from public, anon, authenticated;
revoke execute on function public.email_mark(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.email_set_stopped(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.owner_backers() from public, anon;
revoke execute on function public.admin_email_templates() from public, anon;
revoke execute on function public.admin_email_send_detail(uuid) from public, anon;
revoke execute on function public.owner_save_email_template(uuid, text, text, text, text) from public, anon;
revoke execute on function public.owner_delete_email_template(uuid) from public, anon;
grant execute on function public.email_daily_limit() to authenticated;
grant execute on function public.admin_email_overview() to authenticated;
grant execute on function public.admin_email_reach(uuid[]) to authenticated;
grant execute on function public.admin_email_create(text, text, uuid[], text, text) to authenticated;
grant execute on function public.admin_email_may_send(uuid) to authenticated;
grant execute on function public.admin_email_self() to authenticated;
grant execute on function public.owner_backers() to authenticated;
grant execute on function public.admin_email_templates() to authenticated;
grant execute on function public.admin_email_send_detail(uuid) to authenticated;
grant execute on function public.owner_save_email_template(uuid, text, text, text, text) to authenticated;
grant execute on function public.owner_delete_email_template(uuid) to authenticated;
grant execute on function public.email_daily_limit() to service_role;
grant execute on function public.email_sent_today() to service_role;
grant execute on function public.email_claim_batch(uuid, integer) to service_role;
grant execute on function public.email_mark(uuid, uuid, text, text) to service_role;
grant execute on function public.email_set_stopped(uuid, boolean) to service_role;
