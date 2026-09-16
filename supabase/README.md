# Supabase SQL sources

Repository files are the source of truth. Supabase SQL Editor saved queries are
private bookmarks, so their count does not need to match the number of `.sql`
files in this directory.

## Canonical saved queries

- **YouDO — Cloud Backup Setup** → `user_backups.sql`
- **YouDO — Public Board Initial Setup** → `public_pace.sql`
- **YouDO — Community & Moderation Setup** → `community.sql`
- **YouDO — Community Chat Upgrade** → `community_chat.sql`
- **YouDO — Account Sessions** → `account_sessions.sql`
- **YouDO — Optimize Auth RLS Policies** → `optimize_auth_rls_policies.sql`
- **YouDO — Manage Community Staff** → `operations/manage_community_staff.sql`
- **YouDO — Diagnostic — App Usage** → `operations/inspect_app_usage.sql`

Copy the complete repository file into the matching private saved query. Do not
run a selected fragment of a setup or upgrade file. `community_chat.sql` must be
applied after `public_pace.sql` and `community.sql`, before its client is released.

## Existing saved-query cleanup

- Replace **YouDO — Promote Community Owner** and **YouDO — Demote Community
  Admin** with the single **YouDO — Manage Community Staff** query. It is the
  reusable, idempotent source for owner bootstrap, admin promotion/demotion, and
  public badge visibility.
- Replace **YouDO — Inspect Backup Owners** with **YouDO — Diagnostic — App
  Usage**. Its canonical query is read-only, orders recent server activity first,
  and does not pretend that Supabase can observe offline-only app use.
- **YouDO — Enforce One Live Backup Per User** should be compared with
  `user_backups.sql`. Replace it with the complete current file and rename it to
  **YouDO — Cloud Backup Setup** so its purpose is unambiguous.

The file `add_pace_window_keys.sql` is a compatibility patch for projects that
installed the Board before those columns were included in the canonical setup.
The file `user_backup_snapshots.sql` is the equivalent historical patch for a
project with an older `user_backups` table. Both changes are already included in
their canonical setup files and do not need separate saved queries on a current
project.

Saved-query names and presence do not prove that a script was applied. Record a
successful hosted run and permission checks separately; do not infer production
schema state from the SQL Editor sidebar.
