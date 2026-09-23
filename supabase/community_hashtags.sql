-- Apply after community_chat.sql. Additive and safe to rerun.
-- Hashtags classify members, not individual messages: changing a profile tag
-- changes which exam feed contains that member's currently visible messages.

begin;

create table if not exists public.community_hashtags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  normalized_label text not null unique,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_hashtags_label_length check (char_length(label) between 2 and 24),
  constraint community_hashtags_normalized_length check (char_length(normalized_label) between 2 and 24)
);

create table if not exists public.community_hashtag_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hashtag_id uuid not null references public.community_hashtags(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_hashtag_memberships_tag_idx
  on public.community_hashtag_memberships(hashtag_id);

create table if not exists public.community_hashtag_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  exam_name text not null,
  normalized_exam text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','waiting','approved','declined')),
  admin_response text not null default '',
  resolved_hashtag_id uuid references public.community_hashtags(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_hashtag_requests_exam_length check (char_length(exam_name) between 2 and 50),
  constraint community_hashtag_requests_details_length check (char_length(details) <= 240)
);
-- Earlier builds allowed only one pending request per account, which caused a
-- second exam request to overwrite the first. Pending requests are now unique
-- per account and normalized exam instead.
drop index if exists public.community_hashtag_requests_one_pending_idx;
create unique index if not exists community_hashtag_requests_one_pending_exam_idx
  on public.community_hashtag_requests(requester_id, normalized_exam)
  where status in ('open','waiting');
create index if not exists community_hashtag_requests_review_idx
  on public.community_hashtag_requests(status, normalized_exam, created_at);

alter table public.community_hashtags enable row level security;
alter table public.community_hashtag_memberships enable row level security;
alter table public.community_hashtag_requests enable row level security;
revoke all on public.community_hashtags, public.community_hashtag_memberships, public.community_hashtag_requests from public,anon,authenticated;

create or replace function public.community_hashtag_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'hashtags', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', h.id, 'label', h.label, 'member_count', coalesce(c.member_count,0)
      ) order by h.label)
      from public.community_hashtags h
      left join (
        select hashtag_id, count(*) as member_count
        from public.community_hashtag_memberships group by hashtag_id
      ) c on c.hashtag_id=h.id
      where h.active
    ), '[]'::jsonb),
    'mine', (
      select pg_catalog.jsonb_build_object('id',h.id,'label',h.label)
      from public.community_hashtag_memberships m
      join public.community_hashtags h on h.id=m.hashtag_id and h.active
      where m.user_id=auth.uid()
    ),
    -- Keep the singular key for older clients while new clients render every
    -- active or declined request independently.
    'request', (
      select pg_catalog.jsonb_build_object(
        'id',r.id,'exam_name',r.exam_name,'details',r.details,'status',r.status,
        'admin_response',r.admin_response,'created_at',r.created_at
      ) from public.community_hashtag_requests r
      where r.requester_id=auth.uid() order by r.created_at desc limit 1
    ),
    'requests', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'exam_name',r.exam_name,'details',r.details,'status',r.status,
        'admin_response',r.admin_response,'created_at',r.created_at
      ) order by r.created_at desc)
      from public.community_hashtag_requests r
      where r.requester_id=auth.uid() and r.status in ('open','waiting','declined')
    ), '[]'::jsonb)
  ) where auth.uid() is not null;
$$;

create or replace function public.set_community_hashtag(selected_hashtag uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.community_hashtags;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if selected_hashtag is null then
    delete from public.community_hashtag_memberships where user_id=auth.uid();
    return pg_catalog.jsonb_build_object('id',null,'label',null);
  end if;
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  select * into selected from public.community_hashtags where id=selected_hashtag and active for share;
  if selected.id is null then raise exception 'This exam hashtag is unavailable'; end if;
  insert into public.community_hashtag_memberships(user_id,hashtag_id)
  values(auth.uid(),selected.id)
  on conflict(user_id) do update set hashtag_id=excluded.hashtag_id,updated_at=now();
  return pg_catalog.jsonb_build_object('id',selected.id,'label',selected.label);
end; $$;

create or replace function public.request_community_hashtag(requested_exam text, request_details text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean_exam text := btrim(regexp_replace(coalesce(requested_exam,''),'\s+',' ','g'));
declare clean_details text := btrim(regexp_replace(coalesce(request_details,''),'\s+',' ','g'));
declare normalized text;
declare item public.community_hashtag_requests;
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  if char_length(clean_exam) not between 2 and 50 then raise exception 'Write an exam name of 2–50 characters'; end if;
  if char_length(clean_details)>240 then raise exception 'Context must be 240 characters or fewer'; end if;
  normalized := lower(regexp_replace(clean_exam,'[^a-zA-Z0-9]+','','g'));
  if char_length(normalized)<2 then raise exception 'Write a recognisable exam name'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,11));
  select * into item from public.community_hashtag_requests
    where requester_id=auth.uid() and normalized_exam=normalized and status in ('open','waiting') for update;
  if found then
    update public.community_hashtag_requests set exam_name=clean_exam,
      details=clean_details,status='open',admin_response='',reviewed_by=null,reviewed_at=null,updated_at=now()
      where id=item.id returning * into item;
  else
    insert into public.community_hashtag_requests(requester_id,exam_name,normalized_exam,details)
      values(auth.uid(),clean_exam,normalized,clean_details) returning * into item;
  end if;
  return pg_catalog.to_jsonb(item);
end; $$;

create or replace function public.admin_community_hashtag_requests()
returns table(id uuid,requester_id uuid,exam_name text,normalized_exam text,details text,status text,
  admin_response text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  return query select r.id,r.requester_id,r.exam_name,r.normalized_exam,r.details,r.status,r.admin_response,r.created_at
  from public.community_hashtag_requests r
  where r.status in ('open','waiting')
  order by r.normalized_exam,r.created_at;
end;
$$;

create or replace function public.review_community_hashtag_request(
  target_request uuid, decision text, response_note text default '', hashtag_label text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.community_hashtag_requests;
declare clean_response text := btrim(regexp_replace(coalesce(response_note,''),'\s+',' ','g'));
declare clean_label text := upper(regexp_replace(btrim(regexp_replace(coalesce(hashtag_label,''),'^#+','','g')),'\s+','-','g'));
declare normalized_tag text;
declare tag public.community_hashtags;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if decision not in ('wait','create','reject') then raise exception 'Unknown hashtag request decision'; end if;
  select * into item from public.community_hashtag_requests where id=target_request and status in ('open','waiting') for update;
  if item.id is null then raise exception 'Request is no longer waiting'; end if;
  if char_length(clean_response)>240 then raise exception 'Private reply must be 240 characters or fewer'; end if;
  if decision='reject' then
    update public.community_hashtag_requests set status='declined',admin_response=clean_response,
      reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
      where id=item.id returning * into item;
    insert into public.community_audit_log(admin_id,action,target_user_id,reason)
      values(auth.uid(),'hashtag.request.rejected',item.requester_id,
        case when clean_response='' then '#'||item.exam_name else '#'||item.exam_name||' · '||clean_response end);
    return pg_catalog.to_jsonb(item);
  end if;
  if decision='wait' then
    if char_length(clean_response) not between 5 and 240 then raise exception 'Write a private reply of 5–240 characters'; end if;
    update public.community_hashtag_requests set status='waiting',admin_response=clean_response,
      reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
      where normalized_exam=item.normalized_exam and status in ('open','waiting');
    select * into item from public.community_hashtag_requests where id=target_request;
    insert into public.community_audit_log(admin_id,action,target_user_id,reason)
      values(auth.uid(),'hashtag.request.waiting',item.requester_id,clean_response);
    return pg_catalog.to_jsonb(item);
  end if;
  if char_length(clean_label) not between 2 and 24 then raise exception 'Write a hashtag label of 2–24 characters'; end if;
  normalized_tag := lower(regexp_replace(clean_label,'[^a-zA-Z0-9]+','','g'));
  if char_length(normalized_tag)<2 then raise exception 'Write a recognisable hashtag label'; end if;
  insert into public.community_hashtags(label,normalized_label,created_by)
    values(clean_label,normalized_tag,auth.uid())
    on conflict(normalized_label) do update set label=excluded.label,active=true,updated_at=now()
    returning * into tag;
  insert into public.community_hashtag_memberships(user_id,hashtag_id)
    select r.requester_id,tag.id from public.community_hashtag_requests r
    where r.normalized_exam=item.normalized_exam and r.status in ('open','waiting')
    on conflict(user_id) do update set hashtag_id=excluded.hashtag_id,updated_at=now();
  update public.community_hashtag_requests set status='approved',admin_response=clean_response,
    resolved_hashtag_id=tag.id,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where normalized_exam=item.normalized_exam and status in ('open','waiting');
  insert into public.community_audit_log(admin_id,action,target_user_id,reason)
    values(auth.uid(),'hashtag.created',item.requester_id,'#'||tag.label);
  return pg_catalog.jsonb_build_object('id',tag.id,'label',tag.label);
end; $$;

-- Board readers receive the approved profile hashtag without exposing the
-- protected membership table or duplicating it into local Board preferences.
create or replace function public.board_pace_rows()
returns table(
  user_id uuid, display_name text, exam_label text, hashtag_id uuid, hashtag_label text,
  today_ms bigint, week_ms bigint, month_ms bigint, today_key date, week_key date,
  month_key date, streak integer, bar_hours numeric, updated_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return query
    select p.user_id,p.display_name,p.exam_label,h.id,h.label,p.today_ms,p.week_ms,p.month_ms,
      p.today_key,p.week_key,p.month_key,p.streak,p.bar_hours,p.updated_at
    from public.public_pace p
    left join public.community_hashtag_memberships m on m.user_id=p.user_id
    left join public.community_hashtags h on h.id=m.hashtag_id and h.active;
end; $$;

create or replace function public.community_chat_page_by_hashtag(before_sequence bigint default null, selected_hashtag uuid default null)
returns setof public.community_messages language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_join_community() then return; end if;
  if selected_hashtag is not null then
    if not exists(select 1 from public.community_hashtag_memberships where user_id=auth.uid()) then
      raise exception 'Choose your exam hashtag first' using errcode='42501';
    end if;
    if not exists(select 1 from public.community_hashtags where id=selected_hashtag and active) then
      raise exception 'This exam hashtag is unavailable';
    end if;
  end if;
  return query
    with recent as materialized (
      select m.* from public.community_messages m
      left join public.community_hashtag_memberships hm on hm.user_id=m.author_id
      where public.community_chat_visible(m)
        and (selected_hashtag is null or hm.hashtag_id=selected_hashtag)
      order by m.sequence desc limit 120
    ) select * from recent r where before_sequence is null or r.sequence<before_sequence
      order by r.sequence desc limit 30;
end; $$;

revoke execute on function public.community_hashtag_context() from public,anon;
revoke execute on function public.set_community_hashtag(uuid) from public,anon;
revoke execute on function public.request_community_hashtag(text,text) from public,anon;
revoke execute on function public.admin_community_hashtag_requests() from public,anon;
revoke execute on function public.review_community_hashtag_request(uuid,text,text,text) from public,anon;
revoke execute on function public.community_chat_page_by_hashtag(bigint,uuid) from public,anon;
revoke execute on function public.board_pace_rows() from public,anon;
grant execute on function public.community_hashtag_context() to authenticated;
grant execute on function public.set_community_hashtag(uuid) to authenticated;
grant execute on function public.request_community_hashtag(text,text) to authenticated;
grant execute on function public.admin_community_hashtag_requests() to authenticated;
grant execute on function public.review_community_hashtag_request(uuid,text,text,text) to authenticated;
grant execute on function public.community_chat_page_by_hashtag(bigint,uuid) to authenticated;
grant execute on function public.board_pace_rows() to authenticated;

commit;
