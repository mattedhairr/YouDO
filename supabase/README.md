# Supabase SQL sources

Repository files are the source of truth. Supabase SQL Editor saved queries are
private bookmarks, so their count does not need to match the number of `.sql`
files in this directory.

## Canonical saved queries

- **YouDO — Cloud Backup Setup** → `user_backups.sql`
- **YouDO — Cloud Backup Revisions Upgrade** → `cloud_backup_revisions.sql`
- **YouDO — Public Board Initial Setup** → `public_pace.sql`
- **YouDO — Public Board Evidence Upgrade** → `board_evidence.sql`
- **YouDO — Board Audit Compatibility Bridge** → `board_evidence_legacy_bridge.sql`
- **YouDO — Community & Moderation Setup** → `community.sql`
- **YouDO — Community Chat Upgrade** → `community_chat.sql`
- **YouDO — Community Hashtags Upgrade** → `community_hashtags.sql`
- **YouDO — Admin Hashtag Management** → `community_hashtag_admin.sql`
- **YouDO — Managed App Quotes** → `app_quotes.sql`
- **YouDO — Account Sessions** → `account_sessions.sql`
- **YouDO — Optimize Auth RLS Policies** → `optimize_auth_rls_policies.sql`
- **YouDO — Manage Community Staff** → `operations/manage_community_staff.sql`
- **YouDO — Diagnostic — App Usage** → `operations/inspect_app_usage.sql`

Copy the complete repository file into the matching private saved query. Do not
run a selected fragment of a setup or upgrade file. Apply `community_chat.sql`
after `public_pace.sql` and `community.sql`, then apply `community_hashtags.sql`,
`community_hashtag_admin.sql`, and `app_quotes.sql`,
before releasing their dependent clients.

Apply `cloud_backup_revisions.sql` after `user_backups.sql` and before a client
that reads the `revision` column or calls `cas_user_backup`. The upgrade is
additive; older clients keep their existing backup operations while the server
increments the revision on each write. A saved SQL query alone does not mean
the migration has been applied.

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

Apply `board_evidence.sql` after the backup revision, Board, Community, and
Community Hashtags scripts. It replaces client-uploaded public totals with
session evidence reconciled from each opted-in member's latest cloud backup.
Existing public total columns are preserved but ignored; private sessions and
cloud backups are not changed. Offline sessions join the Board after a
successful sync and reconciliation. Keep this upgrade last if reapplying older
Community scripts, because they contain the former Board RPC implementation.

During the unreleased audit, apply `board_evidence_legacy_bridge.sql` after the
upgrade to keep already-installed clients using their existing Board and kudos
path. The timezone-aware RPC used by the Batch 8 candidate stays evidence-derived.
The bridge temporarily permits old clients to upload legacy totals; do not
claim production anti-forgery enforcement is active while it is installed.
At public release cutover, after compatible clients are distributed, rerun
`board_evidence.sql` to remove the bridge and enforce derived totals for all
Board clients. Do not cut over while an installed client still depends on the
zero-argument legacy Board RPC.
