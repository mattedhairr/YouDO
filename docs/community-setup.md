# Community setup and final verification

Local implementation is not a live migration. The new activity functions and cleanup changes require the updated SQL file; do not assume they are installed because the older community room works.

## Update the existing saved query

1. In Supabase SQL Editor, open **YouDO — Community & Moderation Setup**.
2. Replace its contents with the complete current `supabase/community.sql` from this repository. Keep the saved name.
3. Save, then run the whole query without a partial text selection. It is transactional and uses repeatable table/index creation and policy/function replacement.
4. Confirm success. If there is an error, stop and inspect it; do not run individual remaining statements.
5. Do not rerun promotion or demotion merely to update the setup. Existing admin rows are retained.
6. Deploy/reload the matching new YouDO build. **Board → Admin** opens moderation; **Community** opens the room. The older preview's direct chat/reaction writes are replaced by protected RPCs, so update the SQL and preview together. Released v6.3.0 has no community UI.

This migration does not access private workspace backups or delete user accounts. Cleanup runs through insert triggers on messages and acknowledgements, not a midnight job. Message visibility is determined by each message's own 24-hour expiry. Installing/rerunning the setup does not itself prune history.

The final v7 release review also corrects the audit-log foreign key: if an admin later deletes their own account, the safety log remains with a cleared admin reference instead of blocking deletion. Projects that installed the earlier 570-line setup need the current query once more for this correction. It does not demote or delete any existing account when run.

The current setup also records each changed control with a specific action (room, Kudos, or announcement) and skips unchanged saves. Rerunning the complete query upgrades the functions in place without duplicating tables, admins, messages, or existing audit records.

Admin Board broadcasts are not shortened by the client or setup function. Long broadcasts remain folded to three lines in the community room until a member expands them. Ordinary member messages keep their 240-character limit to prevent the daily room from becoming difficult to scan.

## What the activity figures mean

- **Active recently:** unique, non-banned, opted-in Board accounts with a foreground signal in the last five minutes. It can include someone who just closed the app; do not label it “online now.”
- **Used today:** those accounts with a signal since **00:00 UTC**. This is **05:30 in India**, not local midnight in every country. Old builds are not counted until upgraded.
- One timestamp per participating account; no page URLs, device identifiers, IP collection code, goal contents, or session details are added to this measurement. The authenticated heartbeat records only its caller, at most once a minute server-side; the app attempts it at most every two minutes while visible and online.
- Direct client access to the activity table is revoked. Only an authenticated admin can fetch aggregate totals. Opting out removes the timestamp through the Board-row foreign key.
- Missing or failed activity responses show unavailable, not zero. There is no historical activity graph or all-app-user telemetry.

## Message lifetime and retention

Each room message expires exactly 24 hours after its server-recorded send time. Opening or reading it does not shorten that lifetime, and crossing 00:00 UTC does not clear it. Backgrounded apps refresh on return and the open room removes a message when its individual expiry is reached.

Daily acknowledgements, posting limits, and admin visit totals still use UTC regardless of the database session timezone. Calendar and personal Board focus periods continue to use their existing local-calendar rules. “Active recently” is a rolling five-minute measure; “Used today” resets at the UTC boundary.

Unresolved reports, appeals, restrictions, announcements, and audit records persist across midnight. Report review fetches reported evidence after it leaves the room. `prune_community_history()` retains messages attached to open reports; other messages become eligible for cleanup seven days after expiry, and acknowledgements after 31 days. A 24-hour user-visible lifetime is not a promise of immediate server deletion.

## Rolling messages, replies, and Kudos

- Each new message is delivered to Board members present when it is posted and remains available to those recipients for its rolling 24-hour lifetime. The room shows the newest 120 active messages in chronological order. Opening, closing, or reading the room does not change expiry.
- The upgrade assigns existing messages an expiry of `created_at + 24 hours` and backfills delivery rows only for messages still inside that window. An opt-out deletes that account's deliveries; future membership starts with new deliveries. Removed or banned-author content cannot reappear.
- Reply targets must be active messages delivered to the sender. Replies preserve the relationship while both messages are available; expired or inaccessible targets are rejected. Existing private read-state rows remain temporarily for compatibility with older clients but no longer control visibility, and there is no public “seen by” list.
- **Kudos** is positive-only and irreversible for that day, with one acknowledgement per sender/recipient/UTC day and a 12-per-sender daily ceiling. It unlocks only when the recipient is currently in the selected period's top three **and** has reached 100% of that period's displayed focus bar. Self-acknowledgements, incomplete bars, lower ranks, banned/muted senders, and non-members are rejected server-side.
- The server derives the current date from the viewer's IANA timezone, validates fresh period keys (legacy rows fall back to their update date), and sorts equal focus totals by account ID to match the client. A stale top-three selection is rejected rather than trusted.
- Acknowledgement and one automatic chat note commit in the same transaction. A repeated request adds neither a second acknowledgement nor another note. Pausing the room suppresses automatic notes; the Kudos control can remain independently enabled.
- RPCs validate caller identity and restrict execution; table inserts cannot forge authors or system notes. The implementation follows [Supabase function privilege guidance](https://supabase.com/docs/guides/database/functions).

## Admin pulse

The admin home shows two distinct counts: **Active recently** and **Used today**, with total Board membership shown as context. The redundant percentage and progress bar have been removed. It does not expose member identities, pages, tasks, devices, or exact online presence. The daily count resets at midnight UTC.

## Test before release, using disposable accounts

1. Confirm a non-admin cannot call `community_activity_summary`, modify controls, read another user's appeal, or access the activity table directly.
2. Join the Board with a controlled account on the new build. Its activity should appear after refresh; opting out should remove it. An older build must not be described as currently active without a signal.
3. Submit a report, then confirm it remains reviewable after its message expires. Check the message text is present, not only its identifier.
4. Exercise a temporary mute, ban, appeal, approval, and decline. Verify private Goals, Today, history, sync, and backups remain accessible to the restricted user.
5. Simulate a failed save. Switches must not claim success; retry should work. A failed queue fetch must not masquerade as an empty queue.
6. Verify exact 24-hour expiry, the UTC acknowledgement reset, and cleanup retention in a non-production database. Do not alter the owner's phone clock to test them.

Run `node scripts/test-community-sql.mjs` for isolated PostgreSQL/RLS tests (installation command is at the top of that script). The harness uses PGlite, simulated Supabase roles, and fixture accounts; it omits only pgcrypto installation because UUID generation is built into its PostgreSQL runtime. It runs the real setup twice and exercises rolling 24-hour expiry, replies, protected posting, both Kudos eligibility conditions, acknowledgement deduplication, cleanup, and moderation. It does not validate the hosted project's deployed grants, PostgREST cache, or network behavior; record those live integration results separately before release.
