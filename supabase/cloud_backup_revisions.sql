-- Apply after user_backups.sql, before releasing a client that reads revision.
-- Additive and safe to rerun. Existing direct clients remain supported: the
-- trigger assigns a new server revision and timestamp to every write.

begin;

alter table public.user_backups
  add column if not exists revision bigint not null default 1;

create or replace function public.bump_user_backup_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
  else
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := clock_timestamp();
  return NEW;
end;
$function$;

drop trigger if exists user_backup_revision_write on public.user_backups;
create trigger user_backup_revision_write
before insert or update on public.user_backups
for each row execute function public.bump_user_backup_revision();

create or replace function public.cas_user_backup(
  p_expected_revision bigint,
  p_backup_data text
)
returns table (new_revision bigint, new_updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_backup_data is null then
    raise exception 'Invalid backup write';
  end if;
  if octet_length(p_backup_data) > 4194304 then
    raise exception 'Backup exceeds the 4 MB limit';
  end if;

  if p_expected_revision = 0 then
    return query
      insert into public.user_backups (user_id, backup_data)
      values ((select auth.uid()), p_backup_data)
      on conflict (user_id) do nothing
      returning revision, updated_at;
  else
    return query
      update public.user_backups b
      set backup_data = p_backup_data
      where b.user_id = (select auth.uid())
        and b.revision = p_expected_revision
      returning b.revision, b.updated_at;
  end if;
end;
$function$;

revoke execute on function public.bump_user_backup_revision() from public, anon;
revoke execute on function public.cas_user_backup(bigint, text) from public, anon;
grant execute on function public.cas_user_backup(bigint, text) to authenticated;

commit;
