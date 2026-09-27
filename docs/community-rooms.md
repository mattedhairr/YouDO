# Community rooms — Batch 10

Candidate v7.5.16, Android code 57. Not deployed or released.

## Contract

General is an independent room. Every approved hashtag is visible and readable
to eligible Community members, including members without a profile hashtag.
Only the member's current hashtag room accepts their writes. General remains
available subject to the existing Board membership, ban, mute and rate limits.

Changing a profile hashtag captures the latest expiry and sequence of existing,
unremoved authored messages in any hashtag room. Posting in the new room waits
until those messages expire, at most their remaining 24-hour lifetime. General
messages never cause a wait. No existing hashtag messages means immediate
access. Removing all those messages also removes the wait. Clearing a hashtag
locks all exam composers; reselecting cannot bypass existing messages. Choosing
the same hashtag does not restart a cooldown. Server time decides access.

The membership trigger covers direct selection and admin-request approval.
Assignment and send paths serialize using the existing per-author transaction
lock. The captured sequence prevents newer messages from reactivating an older
cooldown. Staff can moderate any room but cannot bypass membership to post.

## Migration and compatibility

Apply `supabase/community_rooms.sql` after the existing migrations, including
`community_hashtag_admin.sql` and `board_evidence.sql`. It is transactional and
rerunnable. It adds a nullable message destination, membership cooldown fields,
one room/sequence index and a private per-room read-marker table. It replaces
the affected RPC definitions without deleting or moving existing messages.

Existing messages and kudos remain General. Legacy send/inbox/page/read RPCs
use General; the old hashtag-page RPC now returns the actual selected room.
New sends bind their idempotency key to both account and room. Cross-room
replies are rejected. Edits require current write permission; existing author
delete and moderator report/remove rules remain. Inactive rooms are unavailable.
General's read cursor remains in its existing table; hashtag cursors cannot
advance it. Account/Board removal cascades read-state cleanup.

Deploy the migration before distributing the new client. A new client cannot
post when its room-context RPC is unavailable; it never silently falls back to
posting an exam message in General. Legacy clients can continue General posts.
The previously declined Board bridge remains unapplied.

Do not roll back by dropping the destination column or restoring the old
author-filtered feed: that would mix room messages into General. If rollout must
pause, retain the schema and routing and disable new room writes while fixing
forward. No private backup/session data is changed by this migration.

## Verification

- Isolated SQL tests cover legacy message preservation, destinations, no-tag
  reads, membership locks, General-only exemption, cooldown/expiry and clear
  bypass, same-tag reselection, automatic assignment, idempotency, account
  binding, room replies/read markers, direct grant denial, edit/delete/report,
  moderation, muting, disabled posting and membership removal.
- Combined Advisor tests include the new private table and RPC privilege checks.
- Client tests bind retries to the original destination and parse server locks.

Local gates passed on Sept 27: 417 app tests, all eight SQL suites (43 new room
checks), typecheck, lint, build and asset/version/bundle checks. Initial JavaScript
is 635,922 bytes (181,641 gzip). An isolated browser fixture with simulated
responses verified no-tag room reading with disabled posting, own-tag posting,
General isolation after switching, and the server-provided cooldown lock. At
360x640, keyboard End reaches release note 10 while both action buttons stay
visible. These are fixture checks, not hosted database or physical touch checks.

## Hosted verification — September 27, 2026

The user approved and the SQL Editor successfully applied the exact migration
from `bb7d8c6` to YouDO project `iyrnywfaxakvjkmddmqv`. Editor contents were
compared with the committed source before execution. Metadata checks confirmed
the destination column, private read-state RLS, denied direct authenticated
read access, denied anonymous sends, and granted authenticated send RPC access.

Nineteen assertions passed under disposable account B in a rollback-only
transaction: General/room isolation, legacy General routing, no-tag read/write
rules, own-room writes, General-only cooldown exemption, tag-change locks,
General posting during cooldown, clear/reselect bypass denial, expiry unlock,
and same-tag reselection after expiry. A separate read-only query confirmed
zero test rooms/messages remained and B still had no profile hashtag. These
were hosted SQL checks, not a multi-connection race or physical-device test.

Signed Android candidate workflow #209 succeeded at `bb7d8c6`:
https://github.com/mattedhairr/YouDO/actions/runs/36324865970
CI reported 417 passing tests and verified versionName 7.5.16, versionCode 57,
and the pinned signing certificate. Artifact archive SHA-256:
`eba4dd46796a806186c868a1794b9b0939fb7a182df6e03dd0cd7fffefbab296`.

After refreshing the cached client, the browser confirmed v7.5.16, B's Cloud
live state and no profile hashtag. General's composer was enabled; GATE-2027
opened read-only with a disabled composer and profile-setting explanation.
The two missing permanent migration snippets were saved and named in Supabase;
the dashboard inventory now contains 14 named queries. No migration was rerun
during that organization pass.

Still required before merge: physical Android install-over/room/touch checks.
The user is testing workflow #209; results have not yet been reported.
Batch 10 remains unmerged and unreleased; the Board bridge remains unapplied.
