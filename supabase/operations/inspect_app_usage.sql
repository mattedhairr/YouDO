-- Canonical source for the private Supabase saved query:
-- YouDO — Diagnostic — App Usage
--
-- Read-only. It does not inspect goal/task contents or modify any account.
-- "Latest activity" means the newest signal recorded by Supabase. Offline-only
-- work and local app use cannot be observed here and must not be reported as
-- inactivity.

with latest_snapshots as (
  select user_id, max(created_at) as last_snapshot_at
  from public.user_backup_snapshots
  group by user_id
), latest_messages as (
  select author_id as user_id, max(created_at) as last_message_at
  from public.community_messages
  group by author_id
), account_signals as (
  select
    u.id as user_id,
    u.email,
    u.created_at as account_created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    b.updated_at as backup_updated_at,
    pg_catalog.octet_length(b.backup_data) as backup_bytes,
    s.last_snapshot_at,
    p.updated_at as board_updated_at,
    a.last_seen_at as community_last_seen_at,
    m.last_message_at,
    (b.user_id is not null) as has_cloud_backup,
    (p.user_id is not null) as has_board_profile,
    greatest(
      u.last_sign_in_at,
      b.updated_at,
      s.last_snapshot_at,
      p.updated_at,
      a.last_seen_at,
      m.last_message_at
    ) as latest_server_activity_at
  from auth.users u
  left join public.user_backups b on b.user_id = u.id
  left join latest_snapshots s on s.user_id = u.id
  left join public.public_pace p on p.user_id = u.id
  left join public.community_activity a on a.user_id = u.id
  left join latest_messages m on m.user_id = u.id
)
select
  count(*) over () as total_accounts,
  count(*) filter (
    where email_confirmed_at is not null
  ) over () as confirmed_accounts,
  count(*) filter (
    where has_cloud_backup
  ) over () as accounts_with_cloud_backup,
  count(*) filter (
    where latest_server_activity_at >= now() - interval '7 days'
  ) over () as accounts_with_server_activity_7d,
  count(*) filter (
    where latest_server_activity_at >= now() - interval '30 days'
  ) over () as accounts_with_server_activity_30d,
  email,
  case
    when email_confirmed_at is null then 'unverified'
    when latest_server_activity_at >= now() - interval '7 days' then 'server activity within 7 days'
    when latest_server_activity_at >= now() - interval '30 days' then 'server activity within 30 days'
    when latest_server_activity_at is not null then 'older server activity'
    else 'no server activity recorded'
  end as activity_status,
  latest_server_activity_at,
  account_created_at,
  email_confirmed_at,
  last_sign_in_at,
  backup_updated_at,
  backup_bytes,
  last_snapshot_at,
  board_updated_at,
  community_last_seen_at,
  last_message_at,
  has_cloud_backup,
  has_board_profile
from account_signals
order by latest_server_activity_at desc nulls last, account_created_at desc;
