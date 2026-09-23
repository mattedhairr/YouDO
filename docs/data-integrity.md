# Data ownership and integrity

This is a maintainer contract for the staged integrity work, not a release-readiness claim.

## Sources of truth

- Goals own the preparation tree and planning structure. Today holds dated execution tasks linked by goal-node identity. Calendar and rollups derive from those tasks and session history; they must not become independent counters.
- The active timer is device-local, not a cloud-synced running session. Its synchronous journal accepts a start, pause, resume, or discard only after the device write succeeds. A storage error leaves the last saved transition unchanged and is shown in the app.
- Completed session history owns recorded focus time and step evidence. Save history before clearing the active timer. Stable completion IDs prevent a retry creating a second row. A completed-history record takes precedence over a stale native or local active timer.
- Daily focus allocation must conserve a session's saved net duration. Overlapping pauses count once. Imported records with incomplete pause metadata use a bounded proportional allocation rather than inventing extra focus.
- AuthGate readiness belongs to the inspected account and the device workspace owner. Account changes remount the store. Async sync/restore work is bound to its starting account and store lifetime; restore also refuses to replace work edited while its download was pending.
- AuthGate's cloud choice downloads and validates before replacing the device copy. A synchronous recovery checkpoint preserves all previous workspace keys until the new copy and owner have been saved. Failed writes roll back; an incomplete rollback keeps the gate closed until recovery succeeds. Startup recovery runs before opening private or signed-in work. Explicitly starting empty uses the same device checkpoint, but a completed, user-requested cloud replacement is not rolled back with the device.
- Ordinary Goals, Today, trash, history, streak, and pace edits use a scoped local-storage checkpoint for the changed keys and workspace timestamp. A failed write restores the previous device copy and reverts the affected in-memory workspace; if rollback cannot finish, the app stops at recovery instead of opening a mixed copy. Settings import, cloud pull, and cloud merge validate first and commit their full workspace slice with the same checkpoint. A Settings import replaces absent optional collections with clean defaults rather than retaining data from the previous copy. These are device-local guarantees, not a transaction with Supabase or another browser tab.
- Strict startup hydration refuses unreadable or structurally broken workspace collections instead of treating them as empty. Keep device data intact when recovery is shown. The separate active-session journal and synchronous session-history save preserve their existing ordering; a cross-key transaction spanning an active native timer and completed history remains session-batch work.
- Backup parsing refuses unrelated documents, malformed collection containers, and tasks or goal branches that would otherwise be silently dropped. Existing valid compact backups remain readable. Session sanitization still validates individual records separately.
- Cloud backups are snapshots, not a second independent counter. Failed reads are not empty backups. Upload size is measured in UTF-8 bytes. Fingerprints detect differences; they do not prove that either copy is more trustworthy.
- Public focus totals are still client-calculated and honour-based. Authentication proves account access, not attention, and elapsed-time checks do not prove studying.
- Settings password/email changes check the current account before and after password verification, then update through that verified account's non-persistent client. They never borrow the app's mutable session for the update. Temporary-session cleanup follows the update, and cleanup failure does not report a confirmed password change as failed. UI user updates are conditional on the account still matching. Password changes can end other sessions; see [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions). Verification and update require live integration testing before release; they are not proof of the hosted project's configuration.

## Session behavior

Closing or suspending the app does not itself pause a session. A missing five-minute foreground heartbeat is not evidence that study stopped. Reopening an ordinary 98-minute sitting keeps its elapsed time without demanding reconstruction.

The existing four-hour continuous-session safeguard remains. Foreground ticking and reconstruction now apply the same boundary, and a selected reconstruction end cannot extend into the future. Pauses subtract from elapsed duration; sessions below 15 seconds do not create counted focus, and the seven-day corruption bound remains. Do not describe these bounds as evidence of actual attention.

A wall/monotonic-clock discrepancy requests verification; it is not immediately stored as an incident. Fresh server requests bypass caches. Two consistent skewed samples are required before a mismatch is returned. A confirmed incident preserves the pre-jump sample when available; a heartbeat recorded while checking must not become the trusted boundary. Successful checks clear stale incidents. “Continue anyway” explicitly clears the incident; it is a user override, not server verification.

The Android notification snapshot is accepted only when it belongs to the same sitting and has a newer heartbeat than the device journal, or when recovering an otherwise absent unfinished sitting. A finished sitting cannot be revived by notification replay.

## Planning behavior

- A Goal node owns its title, checklist, completion, and current Today pointer. A linked Today card owns its schedule; Calendar derives dated occurrences from cards and recorded sessions. A pointer is valid only when the task belongs to that node. Current linked cards display the Goal's per-step state, including out-of-order completion; historical cards display their saved snapshot progress.
- Replanning an unfinished linked card keeps its task ID and earlier failed dates. Planning a full checklist clears any previous partial `stepSlice`; planning a subset records that subset explicitly. An endpoint with checklist steps cannot be scheduled with no steps selected.
- Deleting a Goal branch moves its original node IDs and unfinished linked cards to Recently Deleted. Completed dated cards and session history stay in place. Restoring a new-format record returns the exact IDs and links; an ID collision stops restoration without consuming the record. Older trash records, whose node IDs were already regenerated, recover their saved tasks as standalone cards rather than claiming a link that cannot be proved.
- Adding, removing, or restoring children recalculates parent completion. A copied branch starts with no progress, Today link, or pin. Progress memoization is keyed by node identity so an updated node with the same ID cannot reuse an old percentage.
- Planning mutations now persist their changed workspace collections under a recoverable device checkpoint. This does not resolve concurrent-tab writes or prove that an async cloud operation committed atomically with device storage.

## Conservative merge behavior

Legacy backups have workspace timestamps but no per-task deletion ledger. A task found only in a secondary modern copy can be either a new task or an intentional deletion on the primary device. When the existing goal/trash evidence cannot resolve that ambiguity, merging stops without replacing either workspace. Differing same-ID goal, task, or session values also stop a combine operation; client timestamps do not decide which edit to discard. Export and explicitly choose the copy to retain; do not silently drop or resurrect work.

All supplied goal-deletion records are considered before limiting the visible trash list. This prevents a supplied older marker being ignored during that merge; it does not provide permanent tombstones after clients have already trimmed their trash.

The pending cloud-revision upgrade adds a server-incremented revision and compare-and-set write. The client must read a revision before writing and treats a stale revision as a conflict. A legacy client may still write directly; its write also increments the revision. Apply and test the hosted migration before releasing a dependent client. This prevents a stale whole-backup upload but does not by itself resolve item-level deletion ambiguity.

## Still required before completing the audit

- Extend device-persistence verification beyond the completed save/restart and install-over gate to real process termination and constrained-storage scenarios when practical. Fault-injection tests cover quota and rollback without filling the user's phone.
- A durable item-level conflict/deletion model; timestamp/fingerprint comparisons alone cannot infer intent or fully handle equal timestamps.
- The device checkpoint does not span local storage and the hosted database. If a cloud upload succeeds but saving the local sync fingerprint fails, the app reports a partial-sync state and requires review on retry.
- Physical Android tests for termination, notification actions, background safety caps, clock changes, keyboard resizing, and install-over behavior. Native wall-clock ordering is not a monotonic event journal.
- Simultaneous browser-tab writers. The timer and replacement compare-before-write checks detect stale copies but are not atomic cross-process locks. Pending replacement events close other gates; that does not make older clients or uncoordinated writes transactional.
- Hosted authentication/RLS and backward-compatible migration checks; public totals remain forgeable by a modified client.
- Finish account-switch review for profile edits, password-recovery completion, and account deletion, not just Settings credential changes and backup operations.

These are unresolved audit items, not completed fixes. Data-loss or permission failures block release. The broad Community feature plan, media usage checks, and repository cleanup remain separate stages.
