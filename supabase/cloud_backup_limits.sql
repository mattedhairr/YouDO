-- YouDO: server-side limits for cloud backups.
-- The app already keeps these limits, but only the app enforced them; a direct
-- call with an account's own token could store far more. Rows saved earlier are
-- left as they are (NOT VALID), and the limits apply to every new write.
--
-- The restore-point limit is higher than the live one because a restore point
-- may hold a device copy that has grown past 4 MB and still needs saving.
--
-- Apply after user_backups.sql and user_backup_snapshots.sql. Safe to re-run.

begin;

alter table public.user_backups drop constraint if exists user_backups_size_limit;
alter table public.user_backups
  add constraint user_backups_size_limit
  check (octet_length(backup_data) <= 4194304) not valid;

alter table public.user_backup_snapshots drop constraint if exists user_backup_snapshots_size_limit;
alter table public.user_backup_snapshots
  add constraint user_backup_snapshots_size_limit
  check (octet_length(backup_data) <= 8388608) not valid;

-- Each account keeps its newest 10 restore points, however they were written.
create or replace function public.trim_user_backup_snapshots()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  delete from public.user_backup_snapshots s
  where s.user_id = NEW.user_id
    and s.id not in (
      select k.id from public.user_backup_snapshots k
      where k.user_id = NEW.user_id
      order by k.created_at desc, k.id
      limit 10
    );
  return null;
end;
$function$;

revoke execute on function public.trim_user_backup_snapshots() from public, anon;

drop trigger if exists user_backup_snapshots_trim on public.user_backup_snapshots;
create trigger user_backup_snapshots_trim
after insert on public.user_backup_snapshots
for each row execute function public.trim_user_backup_snapshots();

commit;
