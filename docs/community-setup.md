# Community setup and final verification

Local implementation is not a live migration. The new activity functions and cleanup changes require the updated SQL file; do not assume they are installed because the older community room works.

## Update the existing saved query

1. In Supabase SQL Editor, open **YouDO — Community & Moderation Setup**.
2. Replace its contents with the complete current `supabase/community.sql` from this repository. Keep the saved name.
3. Save, then run the whole query without a partial text selection. It is transactional and uses repeatable table/index creation and policy/function replacement.
4. Confirm success. If there is an error, stop and inspect it; do not run individual remaining statements.
5. Do not rerun promotion or demotion merely to update the setup. Existing admin rows are retained.
6. Deploy/reload the matching new YouDO build. **Board → Admin** opens moderation; **Community** opens the room. The older preview's direct chat/reaction writes are replaced by protected RPCs, so update the SQL and preview together. Released v6.3.0 has no community UI.

This migration does not access private workspace backups or delete user accounts. Cleanup runs through insert triggers on messages and acknowledgements, not a midnight job. Daily display resets do not depend on cleanup. Installing/rerunning the setup does not itself prune history.

The final v7 release review also corrects the audit-log foreign key: if an admin later deletes their own account, the safety log remains with a cleared admin reference instead of blocking deletion. Projects that installed the earlier 570-line setup need the current query once more for this correction. It does not demote or delete any existing account when run.

## What the activity figures mean

- **Active recently:** unique, non-banned, opted-in Board accounts with a foreground signal in the last five minutes. It can include someone who just closed the app; do not label it “online now.”
- **Used today:** those accounts with a signal since **00:00 UTC**. This is **05:30 in India**, not local midnight in every country. Old builds are not counted until upgraded.
- One timestamp per participating account; no page URLs, device identifiers, IP collection code, goal contents, or session details are added to this measurement. The authenticated heartbeat records only its caller, at most once a minute server-side; the app attempts it at most every two minutes while visible and online.
- Direct client access to the activity table is revoked. Only an authenticated admin can fetch aggregate totals. Opting out removes the timestamp through the Board-row foreign key.
- Missing or failed activity responses show unavailable, not zero. There is no historical activity graph or all-app-user telemetry.

## Day boundaries and retention

The shared room, daily acknowledgements, posting limits, and admin visit totals use UTC regardless of the database session timezone. Calendar and personal Board focus periods continue to use their existing local-calendar rules.

At the UTC boundary the open room clears its read batch and reloads unread deliveries. Backgrounded apps refresh on return. “Active recently” is a rolling five-minute measure and intentionally does not reset; “Used today” uses the new day’s lower bound.

Unresolved reports, appeals, restrictions, announcements, and audit records persist across midnight. Report review fetches the reported message directly, including older days. `prune_community_history()` retains messages attached to open reports and non-removed messages with unread deliveries. Other room messages older than seven days and acknowledgements older than 31 days are eligible for cleanup. Daily hiding is not a promise of immediate server deletion.

## Unread catch-up and Kudos

- Each new message is delivered to Board members present when it is posted. Opening a foreground room marks the displayed batch as read; it stays on screen for that visit. Closing/reopening or reaching 00:00 UTC drops the read batch. Unread messages can survive beyond seven days until opened. Batch size is 120; **Next messages** loads the next batch.
- The one-time upgrade backfills current-day messages, never old chat history. Rerunning preserves existing read states. An opt-out deletes that account's deliveries; future membership starts with new deliveries. Removed/banned-author content cannot reappear in catch-up.
- Read-state rows are accessible only to their own account, not to other members or the in-app admin. Supabase project operators still have database access. There is no public “seen by” list. Read failures show a retry notice and leave messages eligible for another visit.
- **Kudos** is positive-only and irreversible for that day, with one acknowledgement per sender/recipient/UTC day and a 12-per-sender daily ceiling to limit rank-churn spam. It is available on the current top three of Today, Week, or Month. Self-acknowledgements, zero-focus/unranked recipients, banned/muted senders, and non-members are rejected server-side.
- The server derives the current date from the viewer's IANA timezone, validates fresh period keys (legacy rows fall back to their update date), and sorts equal focus totals by account ID to match the client. A stale top-three selection is rejected rather than trusted.
- Acknowledgement and one automatic chat note commit in the same transaction. A repeated request adds neither a second acknowledgement nor another note. Pausing the room suppresses automatic notes; the Kudos control can remain independently enabled.
- RPCs validate caller identity and restrict execution; table inserts cannot forge authors or system notes. The implementation follows [Supabase function privilege guidance](https://supabase.com/docs/guides/database/functions).

## Admin pulse

The admin home shows two distinct counts: **Active recently** and **Used today**, with total Board membership shown as context. The redundant percentage and progress bar have been removed. It does not expose member identities, pages, tasks, devices, or exact online presence. The daily count resets at midnight UTC.

## Test before release, using disposable accounts

1. Confirm a non-admin cannot call `community_activity_summary`, modify controls, read another user's appeal, or access the activity table directly.
2. Join the Board with a controlled account on the new build. Its activity should appear after refresh; opting out should remove it. An older build must not be described as currently active without a signal.
3. Submit a report, then confirm it remains reviewable after its message's day ends. Check the message text is present, not only its identifier.
4. Exercise a temporary mute, ban, appeal, approval, and decline. Verify private Goals, Today, history, sync, and backups remain accessible to the restricted user.
5. Simulate a failed save. Switches must not claim success; retry should work. A failed queue fetch must not masquerade as an empty queue.
6. Verify the UTC reset and cleanup retention in a non-production database. Do not alter the owner's phone clock to test it.

Run `node scripts/test-community-sql.mjs` for isolated PostgreSQL/RLS tests (installation command is at the top of that script). The harness uses PGlite, simulated Supabase roles, and fixture accounts; it omits only pgcrypto installation because UUID generation is built into its PostgreSQL runtime. It runs the real setup twice and exercises unread retention, protected posting, acknowledgement deduplication, and moderation. It does not validate the hosted project's deployed grants, PostgREST cache, or network behavior; record those live integration results separately before release.
