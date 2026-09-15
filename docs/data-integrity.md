# Data ownership and integrity

This is a maintainer contract for the staged integrity work, not a release-readiness claim.

## Sources of truth

- Goals own the preparation tree and planning structure. Today holds dated execution tasks linked by goal-node identity. Calendar and rollups derive from those tasks and session history; they must not become independent counters.
- The active timer is device-local, not a cloud-synced running session. Its synchronous journal accepts a start, pause, resume, or discard only after the device write succeeds. A storage error leaves the last saved transition unchanged and is shown in the app.
- Completed session history owns recorded focus time and step evidence. Save history before clearing the active timer. Stable completion IDs prevent a retry creating a second row. A completed-history record takes precedence over a stale native or local active timer.
- Daily focus allocation must conserve a session's saved net duration. Overlapping pauses count once. Imported records with incomplete pause metadata use a bounded proportional allocation rather than inventing extra focus.
- AuthGate readiness belongs to the inspected account and the device workspace owner. Account changes remount the store. Async sync/restore work is bound to its starting account and store lifetime; restore also refuses to replace work edited while its download was pending.
- Cloud backups are snapshots, not a second independent counter. Failed reads are not empty backups. Upload size is measured in UTF-8 bytes. Fingerprints detect differences; they do not prove that either copy is more trustworthy.
- Public focus totals are still client-calculated and honour-based. Authentication proves account access, not attention, and elapsed-time checks do not prove studying.

## Session behavior

Closing or suspending the app does not itself pause a session. A missing five-minute foreground heartbeat is not evidence that study stopped. Reopening an ordinary 98-minute sitting keeps its elapsed time without demanding reconstruction.

The existing four-hour continuous-session safeguard remains. Foreground ticking and reconstruction now apply the same boundary, and a selected reconstruction end cannot extend into the future. Pauses subtract from elapsed duration; sessions below 15 seconds do not create counted focus, and the seven-day corruption bound remains. Do not describe these bounds as evidence of actual attention.

A wall/monotonic-clock discrepancy requests verification; it is not immediately stored as an incident. Fresh server requests bypass caches. Two consistent skewed samples are required before a mismatch is returned. A confirmed incident preserves the pre-jump sample when available; a heartbeat recorded while checking must not become the trusted boundary. Successful checks clear stale incidents. “Continue anyway” explicitly clears the incident; it is a user override, not server verification.

The Android notification snapshot is accepted only when it belongs to the same sitting and has a newer heartbeat than the device journal, or when recovering an otherwise absent unfinished sitting. A finished sitting cannot be revived by notification replay.

## Conservative merge behavior

Legacy backups have workspace timestamps but no per-task deletion ledger. A task found only in a secondary modern copy can be either a new task or an intentional deletion on the primary device. When the existing goal/trash evidence cannot resolve that ambiguity, merging stops without replacing either workspace. Export and explicitly choose the copy to retain; do not silently drop or resurrect work.

All supplied goal-deletion records are considered before limiting the visible trash list. This prevents a supplied older marker being ignored during that merge; it does not provide permanent tombstones after clients have already trimmed their trash.

## Still required before completing the audit

- Atomic persistence for multi-key Goals/Today/history changes and workspace replacement; the ordinary local-storage hook still uses React effects and does not surface quota failures.
- A durable item-level conflict/deletion model; timestamp/fingerprint comparisons alone cannot infer intent or fully handle equal timestamps.
- Review AuthGate's cloud-choice replacement path: it currently clears the device workspace before the store's subsequent cloud restore. A failed later download must not lose the previous local copy.
- Physical Android tests for termination, notification actions, background safety caps, clock changes, keyboard resizing, and install-over behavior. Native wall-clock ordering is not a monotonic event journal.
- Simultaneous browser-tab writers. The timer's compare-before-write detects stale copies but is not an atomic cross-process lock.
- Hosted authentication/RLS and backward-compatible migration checks; public totals remain forgeable by a modified client.

These are unresolved audit items, not completed fixes. Data-loss or permission failures block release. The broad Community feature plan, media usage checks, and repository cleanup remain separate stages.
