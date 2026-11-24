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
- **YouDO — Hashtag Request Cleanup** → `hashtag_request_cleanup.sql` (after `community_hashtag_admin.sql`)
- **YouDO — Board Update Push** → `board_update_push.sql` (after `push_dispatch.sql`, `hub_push.sql` and `community_chat.sql`)
- **YouDO — Board Update Extras** → `board_update_extras.sql` (after `board_update_push.sql`)
- **YouDO — Community Push** → `community_push.sql` (after `push_dispatch.sql`, `hub_push.sql`, `board_update_push.sql` and `community_rooms.sql`)
- **YouDO — Admin Hub** → `admin_hub.sql` (after every file in `scripts/supabase-setup-order.mjs` before it)
- **YouDO — Backer Claim Push** → `backer_push.sql` (after `admin_hub.sql`)
- **YouDO — Profile Photos** → `profile_photos.sql` (after `backer_push.sql`)
- **YouDO — Hashtag Room Members** → `community_room_members.sql` (after `profile_photos.sql`): the members list inside an exam hashtag room, Board members only, with each person's friend status.
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

## Push notifications

Apply `push_dispatch.sql` after `user_push_tokens.sql` and `community_hashtags.sql`.
Pushes are sent by database triggers through `pg_net`; apps never call the
`send-push` Edge Function, which rejects any request without the shared
`x-push-secret` header. One-time setup per project (values are never committed):

1. SQL Editor: `select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');`
2. SQL Editor: `select vault.create_secret('<random 64-char secret>', 'push_webhook_secret');`
3. Dashboard → Edge Functions → Secrets: `PUSH_WEBHOOK_SECRET` (same secret) and
   `FIREBASE_SERVICE_ACCOUNT` (the whole downloaded key file). Use the dashboard:
   PowerShell strips the JSON quotes when the file is passed to `supabase secrets set`.
4. `supabase functions deploy send-push`.

Then apply `hub_push.sql`: the Private Hub triggers (direct messages, friend
requests, room invites and join requests, @mentions, and every room message for
members who choose "All messages"; rooms default to @mentions only).

Then apply `community_push.sql`: community chat pushes (an @mention or a reply to
your message, in General or an exam hashtag room; every message in your own
hashtag room for those who choose "All messages"; default mentions and replies)
and the Admin Hub pushes to admins (a new hashtag request, a requester's answer,
a reported message), each with its own switch. Inside the app the unread dots
always show and have no switch.

## Admin Hub: owner and admins (v9.0.0)

`admin_hub.sql` lets the Admin Hub look people up, change staff, show growth
numbers and delete accounts, so none of that needs a query any more. There is
one owner (set once with `operations/manage_community_staff.sql`, never from the
app) and any number of admins:

- Admins and the owner: the queue (reports, appeals, hashtag requests), muting
  and banning members (never staff), hashtags, quotes, the activity log, and
  looking people up by name or @username.
- The owner only: emails and sign-in details, saved-data size, making and
  removing admins, the Board broadcast and its notification, the room and Kudos
  switches, Support settings and backer claims, growth numbers, and deleting
  accounts.

The owner-only rules live in the functions themselves, so v9.0.0 also changes
`community_chat.sql` (`set_community_settings`), `board_update_extras.sql`
(`publish_community_update`, `close_community_poll`), `board_update_push.sql`
(`notify_community_update`), `support_settings.sql` (`save_support_settings`) and
`hub_backers.sql` (`get_pending_hub_backers`, `review_hub_backer`). On an
existing project, run only those seven functions, not the whole files:
re-running `community_chat.sql` would undo the room versions of its chat
functions from `community_rooms.sql`. Then run `admin_hub.sql` and deploy the
function that deletes accounts: `npx.cmd supabase functions deploy owner-delete-accounts`.
It asks `owner_accounts_to_delete()` as the signed-in person (only the owner
gets ids, re-checked at that moment) and deletes each with Supabase Auth's own
delete. Junk means: never confirmed and over 7 days old, or confirmed with
nothing saved (no backup over 1 KB, Board, rooms, friends or messages) and no
server activity for 60 days. Staff, backers and anyone with data never count.

## Backer claim push and profile photos (v9.0.0)

`backer_push.sql` pushes "New backer claim" to the owner only when someone
submits a claim (never the UTR, which can show on a lock screen), behind the
owner's Backer Claims switch (`push_preferences.admin_backers`). A push failure
never stops the claim being saved.

`profile_photos.sql` creates the public `avatars` bucket (256 KB, WebP, JPEG or
PNG). Each person can add, replace or delete files only in their own folder
(`avatars/<user id>/`); the app crops and shrinks the photo to 320 px first.
`admin_remove_profile_photo(target)` lets an admin or the owner take a photo
down (never the owner's): the person goes back to the 🎓 emoji in their profile
and account, and the log records who did it. Both files are safe to re-run.

Projects set up before v8.0.0: run `cleanup_retired_private_hub.sql` once. It
removes the old Private Hub on/off switch and the waitlist; the app no longer uses them.

Projects set up before 2026-10-21: run `profiles_hardening.sql` once. Signed-out
visitors can no longer read profiles, and members can no longer set their own
Founding Backer badge.

Then apply `support_settings.sql` (after `hub_backers.sql`): the admin's Support
settings in Admin Hub → Controls (UPI ID, QR code on/off, badge claims on/off,
Support on/off). Paused claims are refused for every app version. Safe to re-run;
saved settings are kept.

Without the Vault secrets, triggers skip the push with a warning and the user's
action still succeeds. `claim_push_token` moves a device to the account signed in
on it, so an earlier account's notifications stop arriving after a switch.

The update notice now uses all release bullets and scrolls them within its panel;
the three-bullet limit described above applied to v7.5.14 and older clients.
