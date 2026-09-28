# Plan with AI — v7.6.0 candidate

## User flow

Describe is split into goal/deadline, routine/starting level, and syllabus/resources.
Date and approximate duration are mutually exclusive controls. Inputs have explicit
minimum widths and native date styling to prevent tablet overflow; input text is
16px to avoid iOS focus zoom. Sections scroll independently above the action bar.

The generated prompt carries the user's available weekly minutes and a 20% buffer,
asks for clarification of consequential unknowns, and budgets learning, retrieval,
practice, spaced revision, tests, analysis and weekly review. It distinguishes a
user deadline from an official exam date. It requests official sources when tools
can verify them and explicitly prohibits invented syllabus details and results
guarantees. Later work remains milestones, with the next one or two weeks actionable.

Users manually copy the prompt into their AI tool. The requested final response is
one complete JSON code block with a working schema example, enabling the tool's
Copy control. No API key, AI subscription integration or automatic data transfer
was added. Actual AI quality still depends on the model and supplied context;
syntax validation cannot establish syllabus accuracy or educational outcomes.

## Import behavior

- Accept paste or a local UTF-8 JSON/text file up to 500 KB.
- Accept raw JSON, one JSON fence, or one unambiguous object with surrounding prose.
- Correct trailing commas only outside strings, reporting that correction.
- Reject duplicate object keys, multiple plans, truncated output, invalid schema,
  invalid dates, injected execution fields, duplicate siblings/steps and existing
  root-title collisions. Never invent missing plan content.
- Offer a copyable correction prompt containing the exact error, original brief
  and rejected response as data. Clipboard fallback text remains selectable.
- Show root strategy, dates, milestones, task descriptions and checklists before
  applying; flag past dates, work beyond the target, parent date conflicts and
  unusually large plans without silently moving tasks.
- Add one undoable draft change. The existing Studio save boundary still applies.
  Goals, Today cards and history are not replaced by an AI import.

## Verification

- App tests: 437 passed across 42 files. Final typecheck, lint, production build
  and version/bundle verification passed, including the import-feedback changes.
- Prompt example is parsed by the real importer in a test. Cases cover ChatGPT
  copy wrappers, Unicode, quoted/bracket text, trailing commas, truncation, multiple
  objects, duplicate keys, schema restrictions, size/depth limits and draft append.
- Disposable B browser: guided entry, correct 15h weekly / 12h planned budget,
  clipboard copy, cut-off response and correction copy, local file import, expanded
  descriptions/checklists, Add to draft and Undo passed. No test plan was saved.
- Tablet viewport 1024×768 and phone 360×640 showed contained inputs and separate
  scrolling body/footer. These are browser viewport checks, not physical iPad Safari.
- The initial preview server was stopped and the browser served old cached assets.
  Restarted it on 127.0.0.1:5179; did not clear site data or sign out.

## Follow-up checks accepted after publication

The user chose to publish v7.6.0 and check these afterward. Record any failure
for a focused hotfix; do not describe an unrun check as passed.

1. Physical iPad Safari layout is unavailable to the user. Tablet and phone
   browser viewport checks passed; the affected iPad hardware remains untested.
2. The user will try a fresh ChatGPT conversation with the generated prompt and
   import its answer tomorrow. Browser checks used a labelled QA fixture. The
   screenshot's exact rejected JSON was not supplied.
3. The user will test the v7.6.0 in-app Android installer after publication,
   including install-over, retained disposable B data and Board/room behavior.
4. The outstanding physical community/touch checks in `community-rooms.md` and
   updater checks in `update-delivery.md` remain pending, not passed. Earlier
   explicit Batch 6 and Batch 9 waivers remain waivers.

Signed v7.6.0/code59 candidate workflow #212 passed at `5e76210` with 437 app
tests, SQL checks, Android compilation, pinned certificate and release identity:
https://github.com/mattedhairr/YouDO/actions/runs/36423122633

No SQL or hosted backend changes are required for this feature.
