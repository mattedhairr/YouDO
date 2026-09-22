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
), summary as (
  select
    count(*) as total_accounts,
    count(*) filter (where email_confirmed_at is not null) as confirmed_accounts,
    count(*) filter (where has_cloud_backup) as accounts_with_cloud_backup,
    count(*) filter (
      where latest_server_activity_at >= now() - interval '7 days'
    ) as accounts_with_server_activity_7d,
    count(*) filter (
      where latest_server_activity_at >= now() - interval '30 days'
    ) as accounts_with_server_activity_30d
  from account_signals
), result_rows as (
  select
    0 as sort_group,
    'SUMMARY'::text as row_type,
    total_accounts::text,
    confirmed_accounts::text,
    accounts_with_cloud_backup::text,
    accounts_with_server_activity_7d::text,
    accounts_with_server_activity_30d::text,
    ''::text as email,
    ''::text as activity_status,
    ''::text as latest_server_activity_at,
    ''::text as account_created_at,
    ''::text as email_confirmed_at,
    ''::text as last_sign_in_at,
    ''::text as backup_updated_at,
    ''::text as backup_bytes,
    ''::text as last_snapshot_at,
    ''::text as board_updated_at,
    ''::text as community_last_seen_at,
    ''::text as last_message_at,
    ''::text as has_cloud_backup,
    ''::text as has_board_profile
  from summary

  union all

  select
    1,
    'ACCOUNT',
    '',
    '',
    '',
    '',
    '',
    coalesce(email, ''),
    case
      when email_confirmed_at is null then 'unverified'
      when latest_server_activity_at >= now() - interval '7 days' then 'server activity within 7 days'
      when latest_server_activity_at >= now() - interval '30 days' then 'server activity within 30 days'
      when latest_server_activity_at is not null then 'older server activity'
      else 'no server activity recorded'
    end,
    coalesce(latest_server_activity_at::text, ''),
    coalesce(account_created_at::text, ''),
    coalesce(email_confirmed_at::text, ''),
    coalesce(last_sign_in_at::text, ''),
    coalesce(backup_updated_at::text, ''),
    coalesce(backup_bytes::text, ''),
    coalesce(last_snapshot_at::text, ''),
    coalesce(board_updated_at::text, ''),
    coalesce(community_last_seen_at::text, ''),
    coalesce(last_message_at::text, ''),
    case when has_cloud_backup then 'yes' else 'no' end,
    case when has_board_profile then 'yes' else 'no' end
  from account_signals
)
select
  row_type,
  total_accounts,
  confirmed_accounts,
  accounts_with_cloud_backup,
  accounts_with_server_activity_7d,
  accounts_with_server_activity_30d,
  email,
  activity_status,
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
from result_rows
order by sort_group, latest_server_activity_at desc, account_created_at desc;
