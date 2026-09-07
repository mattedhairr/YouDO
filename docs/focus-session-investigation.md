# v6.3.0 missing-session investigation

Status: incident not yet explained or recovered. Do not describe it as fixed by admin changes.

This public note omits account identifiers, private goal names, checklist contents, and exact personal activity times.

## Evidence reported and observed

- A user reported completing a scheduled task on v6.3.0 through **Stop session → Save progress**, after a long focus sitting.
- Read-only preview inspection showed the task complete but no corresponding focus record. The Calendar label was **Manual**.
- That label is inferred when countable completion evidence is absent; it does not establish which UI action the user took.
- A later refresh showed another task with its own saved session. The affected task remained labelled Manual without a session. This establishes that not all account session writes/syncs fail; it does not recover the missing sitting.
- The phone runs v6.3.0 and is reported unresponsive. The latest phone JSON cannot currently be exported. Last night's pre-email-change backup exists but predates this session.
- No local phone records, Android logs, or crash trace have been obtained. The preview proves completion arrived, not where the session disappeared. Admin promotion and simultaneous login are not established causes.

## Safeguards implemented in the pending build

- Session completion now requires a matching active task and a successful synchronous local history write. Failure leaves the sitting open with a visible error instead of silently applying completion.
- A session too short to produce a record is not silently discarded by Save progress. The user can continue or explicitly discard it; clock-interruption recovery remains available.
- Saving closes the active-session reference immediately, preventing repeated completion callbacks from recording twice.
- Native callbacks cannot revive a recorded sitting or replace a different active sitting. Native boot restoration requires a matching local task. On launch, a saved history record also clears a stale local timer left by an interrupted save.
- Manual Goal/Today completion cannot bypass an active sitting; use Save progress from its timer.
- Isolated tests cover a 98-minute session, storage failure, native replay, and legacy-format history merging. These reproduce code risks, not the user's exact phone failure.

## Remaining evidence and release checks

1. Keep last night's JSON and do not clear app storage, uninstall, overwrite cloud data, or fabricate the missing duration.
2. Closing the app from Recent Apps and reopening does not clear app data. If it remains unresponsive, obtain Android/WebView versions and, if available, an Android crash/console trace with secrets removed.
3. If the phone becomes responsive, export its current JSON before syncing or editing. Compare session records and active-session metadata with the current web/cloud copy by task ID and timestamp.
4. Test the pending APK on a disposable workspace: focus while foregrounded/backgrounded, pause/resume via notification, save progress, reopen, and reconcile on a second device. Confirm one session with unchanged duration; test a forced local-save failure separately.
5. Validate install-over-v6.3.0, Android notification handling, storage persistence, and cross-version reconciliation before release. A browser-only pass cannot establish native recovery.

No edits were made to the affected completion, focus history, or cloud account during investigation. The owner chose to proceed with release preparation while deferring this investigation; that decision does not establish recovery or compatibility.
