-- Supabase Snippet Name: YouDO — Support Settings
-- What Settings → Support YouDO shows (the UPI ID, its QR code, Founding Backer
-- claims), edited in Admin Hub → Controls. Apply after community.sql and
-- hub_backers.sql. Additive and safe to re-run: saved settings are kept.

begin;

create table if not exists public.app_support_settings (
  id smallint primary key default 1 check (id=1),
  support_enabled boolean not null default true,
  upi_id text not null default 'mattedhairr@axl',
  qr_enabled boolean not null default true,
  claims_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_support_settings_upi_id check (upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9]{2,64}$')
);
insert into public.app_support_settings(id) values(1) on conflict(id) do nothing;

alter table public.app_support_settings enable row level security;
revoke all on public.app_support_settings from public,anon,authenticated;

create or replace function public.support_settings()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('supportEnabled',s.support_enabled,'upiId',s.upi_id,
    'qrEnabled',s.qr_enabled,'claimsEnabled',s.claims_enabled)
  from public.app_support_settings s where s.id=1;
$$;

create or replace function public.save_support_settings(
  support_enabled boolean, upi_id text, qr_enabled boolean, claims_enabled boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare clean_upi text := btrim(coalesce(upi_id,''));
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if clean_upi !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9]{2,64}$' then
    raise exception 'Enter a UPI ID like name@bank';
  end if;
  update public.app_support_settings s set
    support_enabled=coalesce(save_support_settings.support_enabled,true),
    upi_id=clean_upi,
    qr_enabled=coalesce(save_support_settings.qr_enabled,true),
    claims_enabled=coalesce(save_support_settings.claims_enabled,true),
    updated_by=auth.uid(), updated_at=now()
  where s.id=1;
  insert into public.community_audit_log(admin_id,action,reason)
    values(auth.uid(),'support.updated',left(format('UPI %s · Support %s · QR %s · Claims %s', clean_upi,
      case when save_support_settings.support_enabled then 'on' else 'off' end,
      case when save_support_settings.qr_enabled then 'on' else 'off' end,
      case when save_support_settings.claims_enabled then 'on' else 'off' end),120));
  return public.support_settings();
end;
$$;

-- Paused claims are refused for every app version, old ones included, since
-- they all add claims to hub_backers. Badges already given are untouched.
create or replace function public.hub_backers_claims_open()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((select s.claims_enabled from public.app_support_settings s where s.id=1),true) then
    raise exception 'Badge claims are paused';
  end if;
  return new;
end;
$$;
drop trigger if exists hub_backers_claims_open on public.hub_backers;
create trigger hub_backers_claims_open before insert on public.hub_backers
  for each row execute function public.hub_backers_claims_open();

revoke execute on function public.support_settings() from public;
revoke execute on function public.save_support_settings(boolean,text,boolean,boolean) from public,anon;
revoke execute on function public.hub_backers_claims_open() from public,anon,authenticated;
grant execute on function public.support_settings() to anon,authenticated;
grant execute on function public.save_support_settings(boolean,text,boolean,boolean) to authenticated;

commit;
