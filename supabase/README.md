# Supabase SQL sources

Repository files are the source of truth. Supabase SQL Editor saved queries are
private bookmarks, so their count does not need to match the number of `.sql`
files in this directory.

## Canonical saved queries

- **YouDO — Cloud Backup Setup** → `user_backups.sql`
- **YouDO — Cloud Backup Revisions Upgrade** → `cloud_backup_revisions.sql`
- **YouDO — Public Board Initial Setup** → `public_pace.sql`
- **YouDO — Public Board Evidence Upgrade** → `board_evidence.sql`
- **YouDO — Community Chat Rooms Upgrade** → `community_rooms.sql`
- **YouDO — Community & Moderation Setup** → `community.sql`
- **YouDO — Community Chat Upgrade** → `community_chat.sql`
- **YouDO — Community Hashtags Upgrade** → `community_hashtags.sql`
- **YouDO — Admin Hashtag Management** → `community_hashtag_admin.sql`
- **YouDO — Managed App Quotes** → `app_quotes.sql`
- **YouDO — Account Sessions** → `account_sessions.sql`
- **YouDO — Optimize Auth RLS Policies** → `optimize_auth_rls_policies.sql`
- **YouDO — Manage Community Staff** → `operations/manage_community_staff.sql`
- **YouDO — Diagnostic — App Usage** → `operations/inspect_app_usage.sql`
- **YouDO — Diagnostic — Synced App Versions** → `operations/inspect_app_versions.sql`

Copy the complete repository file into the matching private saved query. Do not
run a selected fragment of a setup or upgrade file. Apply `community_chat.sql`
after `public_pace.sql` and `community.sql`, then apply `community_hashtags.sql`,
`community_hashtag_admin.sql`, and `app_quotes.sql`,
before releasing their dependent clients.

The synced app versions diagnostic puts backups written by the latest release
first, with the newest uploads at the top of each group. Change its
`latest_release` value after each public release. A backup's version is its last
writer, not a reliable reading of every app currently installed by that user.

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

On September 27, the dashboard inventory was reconciled to these 14 names.
The missing Board Evidence and Community Chat Rooms snippets were saved from
their repository sources, with source/order/deployment notes in their
descriptions. Saving them did not rerun either migration. Their SQL editor
contents were compared with the source files. The other 12 existing snippets
were retained; their full contents were not re-audited during this organization
pass. Temporary verification queries are discarded after use rather than saved
alongside migrations. The read-only Advisor inspection script remains in
`operations/inspect_advisors.sql`; historical patches remain in Git without
separate dashboard bookmarks.

Apply `board_evidence.sql` after the backup revision, Board, Community, and
Community Hashtags scripts. It replaces client-uploaded public totals with
session evidence reconciled from each opted-in member's latest cloud backup.
Existing public total columns are preserved but ignored; private sessions and
cloud backups are not changed. Offline sessions join the Board after a
successful sync and reconciliation. Apply it after older Community scripts,
because they contain the former Board RPC implementation. Apply
`community_rooms.sql` afterward; older chat scripts would restore obsolete room
routing if rerun after that upgrade.

`community_rooms.sql` adds fixed message destinations, per-room read markers,
and server-enforced hashtag-change cooldowns. It was applied to the YouDO live
project from commit `bb7d8c6` on September 27, 2026. Hosted grants/RLS checks and
19 disposable-account assertions passed. The assertions ran in a rolled-back
transaction; a separate query confirmed zero remaining test messages or rooms.
See `docs/community-rooms.md` for compatibility and remaining device gates.

Older apps must update to use the current Board. The unused compatibility bridge
was never deployed and was removed from the repository; Git history retains it.
This cleanup does not change the live database or private focus history/backups.

The update notice now uses all release bullets and scrolls them within its panel;
the three-bullet limit described above applied to v7.5.14 and older clients.
