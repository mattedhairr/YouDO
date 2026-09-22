-- YouDO managed header quotes. Apply after community.sql.
-- Additive, rerunnable, and compatible with clients that keep local quotes.

begin;

create table if not exists public.app_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_text text not null,
  author text not null default 'YouDO',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_quotes_text_length check (char_length(btrim(quote_text)) between 10 and 180),
  constraint app_quotes_author_length check (char_length(btrim(author)) between 2 and 40)
);

create table if not exists public.app_quote_settings (
  id smallint primary key default 1 check (id=1),
  defaults_seeded_at timestamptz
);
insert into public.app_quote_settings(id) values(1) on conflict(id) do nothing;

do $seed_app_quotes$
begin
  if (select defaults_seeded_at is null from public.app_quote_settings where id=1 for update) then
    insert into public.app_quotes(quote_text,author,sort_order) values
      ('Your plan is a promise. Give it evidence today.','YouDO',10),
      ('One day, the deadline will be today. Prepare while preparation is still a choice.','YouDO',20),
      ('You do not need a perfect day. You need an honest start.','YouDO',30),
      ('While you negotiate with the next hour, someone else is using theirs.','YouDO',40),
      ('The deadline does not care whether you felt ready.','YouDO',50),
      ('You once begged for this chance. Do not treat it like an ordinary day.','YouDO',60),
      ('Do the difficult part before you negotiate with it.','YouDO',70),
      ('This ordinary hour may be the one your result remembers.','YouDO',80),
      ('Rest on purpose. Return with purpose.','YouDO',90),
      ('Every hour you postpone returns in the exam hall as a question you cannot answer.','YouDO',100),
      ('Your ambition deserves more than your spare attention.','YouDO',110),
      ('Someone with fewer advantages is making better use of this same hour.','YouDO',120),
      ('Discipline is keeping the next small promise.','YouDO',130),
      ('The gap between you and them is being built in quiet hours like this one.','YouDO',140),
      ('Protect your attention. It is building your future.','YouDO',150),
      ('You are spending a day you will never be given again.','YouDO',160),
      ('Your dream has already cost you comfort. Make that sacrifice mean something.','YouDO',170),
      ('Someone made your opportunity possible. Do not spend it carelessly.','YouDO',180),
      ('Nothing hurts like meeting the life you could have built.','YouDO',190),
      ('The worst result is knowing you had the time and watched yourself waste it.','YouDO',200);
    update public.app_quote_settings set defaults_seeded_at=now() where id=1;
  end if;
end;
$seed_app_quotes$;

create index if not exists app_quotes_active_order_idx on public.app_quotes(active,sort_order,id);

alter table public.app_quotes enable row level security;
alter table public.app_quote_settings enable row level security;
revoke all on public.app_quotes,public.app_quote_settings from public,anon,authenticated;

create or replace function public.active_app_quotes()
returns table(id uuid,quote_text text,author text)
language sql stable security definer set search_path='' as $$
  select q.id,q.quote_text,q.author from public.app_quotes q
  where q.active order by q.sort_order,q.created_at,q.id;
$$;

create or replace function public.admin_app_quotes()
returns table(id uuid,quote_text text,author text,active boolean,sort_order integer,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  return query select q.id,q.quote_text,q.author,q.active,q.sort_order,q.updated_at
    from public.app_quotes q order by q.sort_order,q.created_at,q.id;
end;
$$;

create or replace function public.save_app_quote(
  target_id uuid, quote_text text, quote_author text default 'YouDO', quote_active boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare clean_text text := btrim(regexp_replace(coalesce(quote_text,''),'\s+',' ','g'));
declare clean_author text := btrim(regexp_replace(coalesce(quote_author,''),'\s+',' ','g'));
declare saved_id uuid;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if char_length(clean_text) not between 10 and 180 then raise exception 'Quote must be 10–180 characters'; end if;
  if char_length(clean_author) not between 2 and 40 then raise exception 'Author must be 2–40 characters'; end if;
  if target_id is null then
    insert into public.app_quotes(quote_text,author,active,sort_order,created_by,updated_by)
      values(clean_text,clean_author,quote_active,coalesce((select max(sort_order)+10 from public.app_quotes),10),auth.uid(),auth.uid())
      returning id into saved_id;
    insert into public.community_audit_log(admin_id,action,reason)
      values(auth.uid(),'quotes.created',left(clean_text,120));
  else
    update public.app_quotes set quote_text=clean_text,author=clean_author,active=quote_active,
      updated_by=auth.uid(),updated_at=now() where id=target_id returning id into saved_id;
    if saved_id is null then raise exception 'Quote no longer exists'; end if;
    insert into public.community_audit_log(admin_id,action,reason)
      values(auth.uid(),'quotes.updated',left(clean_text,120));
  end if;
  return saved_id;
end;
$$;

create or replace function public.delete_app_quote(target_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare removed_text text;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  delete from public.app_quotes where id=target_id returning quote_text into removed_text;
  if removed_text is null then raise exception 'Quote no longer exists'; end if;
  insert into public.community_audit_log(admin_id,action,reason)
    values(auth.uid(),'quotes.deleted',left(removed_text,120));
end;
$$;

revoke execute on function public.active_app_quotes() from public;
revoke execute on function public.admin_app_quotes() from public,anon;
revoke execute on function public.save_app_quote(uuid,text,text,boolean) from public,anon;
revoke execute on function public.delete_app_quote(uuid) from public,anon;
grant execute on function public.active_app_quotes() to anon,authenticated;
grant execute on function public.admin_app_quotes() to authenticated;
grant execute on function public.save_app_quote(uuid,text,text,boolean) to authenticated;
grant execute on function public.delete_app_quote(uuid) to authenticated;

commit;
