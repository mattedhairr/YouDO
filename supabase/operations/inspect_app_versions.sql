-- Canonical source for the private Supabase saved query:
-- YouDO — Diagnostic — Synced App Versions
--
-- Read-only. Update latest_release after each public app release.
-- A backup's version identifies the app that last UPLOADED it. Opening a newer
-- app without a workspace change does not refresh this value. A user can also
-- have several devices on different versions. This cannot prove which version
-- is currently installed, or whether a user has updated an offline device.
-- Run only in the trusted project SQL Editor: results contain account emails.

with latest_release as (
  select '7.6.1'::text as latest_version
), observed as (
  select
    u.id as user_id,
    u.email,
    u.last_sign_in_at,
    b.updated_at as last_backup_uploaded_at,
    substring(
      b.backup_data from
      '"app"[[:space:]]*:[[:space:]]*"YouDO"[[:space:]]*,[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)"'
    ) as last_synced_version,
    (b.user_id is not null) as has_cloud_backup
  from auth.users u
  left join public.user_backups b on b.user_id = u.id
), classified as (
  select
    o.*,
    r.latest_version,
    case
      when o.last_synced_version = r.latest_version then 0
      when o.last_synced_version is not null then 1
      when o.has_cloud_backup then 2
      else 3
    end as sort_group
  from observed o
  cross join latest_release r
)
select
  email,
  user_id,
  latest_version,
  last_synced_version,
  case sort_group
    when 0 then 'Latest version in synced backup'
    when 1 then 'Different backup version; installed version unknown'
    when 2 then 'Backup version unavailable'
    else 'No cloud backup; installed version unknown'
  end as version_status,
  last_backup_uploaded_at,
  last_sign_in_at
from classified
order by sort_group, last_backup_uploaded_at desc nulls last,
  last_sign_in_at desc nulls last, email;
