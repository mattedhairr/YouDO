# Handoff Report — Specification Miner (Blueprint Studio Rebuild)

## 1. Observation

1. **User Request & Requirements (`ORIGINAL_REQUEST.md`):**
   - Lines 14–30 specify requirements R1–R5:
     - **R1. Flexible Node Expansion:** "Users must have the choice when expanding a node: they can either add checklist steps (turning it into an executable task) OR add child nodes (turning it into a branch/folder). This should be explicit and user-driven."
     - **R2. Bulk 'Add Inside':** "Users must be able to select multiple nodes and add items inside all of them simultaneously."
     - **R3. Bulk Step Editing (Diffing):** "When multiple nodes are selected, users can edit their steps in bulk: Adding: New steps added in the bulk editor are added to all selected nodes. If a node already has that exact step, skip it (no duplicates). Removing: Steps deleted in the bulk editor are removed from all selected nodes. If a node doesn't have that step, skip it."
     - **R4. Bulk & Individual Date Changing:** "Users must be able to change target dates and deadlines for a single node, or select multiple nodes and apply the same date changes to all of them at once."
     - **R5. Soothing & Simple UI/UX:** "The interface must feel clean, soothing, and simple to use. Avoid overly complicated menus or cluttered layouts."
   - Lines 33–38 specify Acceptance Criteria:
     - Independent agent-as-judge can verify bulk-adding child nodes.
     - Independent agent-as-judge can verify set-union/set-difference step diffing without duplicates or errors for missing steps.
     - Programmatic or manual test confirms bulk date changes.
     - UI cleanly presents the choice between "steps" or "children".

2. **Existing Data Model (`src/types.ts` lines 41–61):**
   ```ts
   export interface GoalNode {
     id: string;
     kind: GoalKind;
     title: string;
     description?: string;
     startDate?: string; // ISO date
     endDate?: string; // ISO date
     children: GoalNode[];
     steps?: string[];
     stepDone?: boolean[];
     completed?: boolean;
     todayTaskId?: string | null;
     pinned?: boolean;
     createdAt: number;
   }
   ```

3. **Existing Tree Rollup & Endpoint Constraints (`src/lib/goalTree.ts`):**
   - Line 13: `isGoalEndpoint(node): boolean { return node.children.length === 0; }`
   - Lines 23–30:
     ```ts
     export function hasGoalExecutionState(node: GoalNode): boolean {
       return Boolean(
         node.todayTaskId ||
         node.completed ||
         (node.steps?.length ?? 0) > 0 ||
         (node.stepDone?.some(Boolean) ?? false)
       );
     }
     ```
   - Lines 53–66: `rollupPct(node)` evaluates `node.children.length > 0` first and calculates the mean of child rollups; only if `children.length === 0` does it inspect `node.steps`. If a node had both, `steps` would be completely ignored.

4. **Existing Implementation Friction Points (`src/components/BlueprintStudio.tsx` & `src/components/studio/StudioForms.tsx`):**
   - Line 26 in `BlueprintStudio.tsx`: `const canAddInside = (node: GoalNode) => node.kind === 'goal' || !isGoalEndpoint(node) || !hasGoalExecutionState(node);`
   - Line 249 in `StudioForms.tsx`:
     `blocked.length > 0 && <p role="alert" className="studio-error">{blocked.length} selected task{blocked.length === 1 ? '' : 's'} already contain steps or recorded work. Add checklist steps instead.</p>`
     If even a single selected node had steps, the bulk "Add Inside" form was completely blocked and disabled.
   - Lines 321–353 in `StudioForms.tsx`: `StudioChecklistForm` only allowed renaming or deleting existing steps; it did not allow adding new steps simultaneously in the same unified diff view. Adding steps required a completely different panel (`StudioAddForm` with `kind: 'steps'`).
   - Lines 193–219 in `BlueprintStudio.tsx`: Long-press-to-select used a fragile 420ms timer with a 6px movement cancellation threshold, conflicting with mobile touch-scrolling.

5. **Existing Vitest Test Suite Execution:**
   - Ran `npm test -- src/lib/blueprintStudio.test.ts`. Command exited with code 0 (18 passed in 27ms).
   - Verifies baseline operations (`addBlueprintChildren`, `addBlueprintSteps`, `removeBlueprintSteps`, `renameBlueprintStep`, `reconcileBlueprintTasks`).

---

## 2. Logic Chain

1. **R1 (Flexible Node Expansion):**
   - *Premise from Observation 1 & 3:* A node in YouDO represents either an intermediate category container (`children.length > 0`) or an actionable task scheduled to Today (`children.length === 0`, with `steps`).
   - *Inference:* A node must never be in an ambiguous hybrid state. When expanding an empty leaf, the UI must explicitly present the two paths ("Add Sub-items / Children" vs "Add Checklist Steps").
   - *Transition handling:* If a node already has steps and the user chooses to add child items, the system must not abruptly crash or block; it must offer to convert the existing steps into child nodes or clear them, while protecting any completed steps or active focus sessions.

2. **R2 (Bulk 'Add Inside'):**
   - *Premise from Observation 1, 4 & 5:* Users select multiple nodes to add repeated syllabus/sub-item structures (e.g., chapters or lectures).
   - *Inference:* The target set must treat each selected node as an intended destination container.
   - *Invariance:* Newly added child nodes must receive fresh, unique UIDs (`uid('goal')`).
   - *Deduplication:* If Parent A already has child "Lecture 1" and Parent B does not, adding "Lecture 1" adds it to Parent B and skips Parent A without throwing an error.

3. **R3 (Bulk Step Editing / Diffing):**
   - *Premise from Observation 1 & 4:* Currently, adding steps and removing/editing steps are isolated into two completely separate modal screens.
   - *Inference:* R3 demands a single unified Bulk Step Diffing Editor.
   - *Algorithmic Formulation:*
     - The editor displays the union of all existing steps across the selected tasks, annotated with prevalence counters ("In all $N$ tasks" vs "In $k$ of $N$ tasks").
     - **Additions (Set-Union):** Newly added steps are appended to every selected task that does not already have them. Tasks already possessing the step skip it (zero duplicates).
     - **Removals (Set-Difference):** Steps deleted in the editor are removed from all selected tasks possessing them. Tasks lacking the step skip it silently without errors.
     - **Protection:** Incomplete steps are deleted; completed steps are preserved by default.

4. **R4 (Bulk & Individual Date Changing):**
   - *Premise from Observation 1 & 2:* Goal nodes carry `startDate` and `endDate` in ISO `YYYY-MM-DD` format.
   - *Inference:* Users need both quick individual date setting and bulk date application across multiple selected nodes.
   - *Validation:* If both dates are present, `startDate <= endDate`. If a bulk deadline conflicts with an earlier start date, the system auto-adjusts or warns the user.
   - *Presets:* Quick 1-tap buttons (Today, Tomorrow, End of Week, +2 Weeks, +1 Month, Clear) accelerate scheduling.

5. **R5 (Soothing & Simple UI/UX):**
   - *Premise from Observation 1 & 4:* The previous design suffered from fragmented modals, complex nested tabs (`together` vs `individual`, `one` vs `list` vs `numbered`), long-press gesture conflicts, and cluttered button rows.
   - *Inference:* Rebuilding from scratch requires a unified, serene architecture:
     - Clear touch targets and explicit Select mode (checkboxes / select toggle).
     - Single floating bottom bar upon selection.
     - Clean, focused bottom sheets for operations (Add Inside, Steps Diffing, Dates).
     - Calm pastel/neutral styling aligned with YouDO's aesthetic tokens.

---

## 3. Caveats

1. **Active Focus Session Lock:** If an active session is in progress on a specific task (`activeGoalNodeId`), editing or deleting that task in Blueprint Studio must remain blocked until the session ends, in order to preserve live timer and notification synchronization.
2. **AI Plan Flow Integration:** `src/components/studio/AIPlanFlow.tsx` exists as a self-contained AI blueprint generator. It should remain accessible from the Studio toolbar as a secondary action without cluttering the manual editing flow.
3. **Daily Task Reconciliation:** Edits made in Blueprint Studio must continue to route through `reconcileBlueprintTasks` upon commit so that historical completed cards in Today/Backlog are preserved as immutable snapshots.

---

## 4. Conclusion

The specification for rebuilding Blueprint Studio is fully defined, mathematically formulated, and documented in:
`d:\Production\Projects\YouDO\.agents\teamwork\spec_miner_survey_1\analysis.md`

Key deliverables specified:
1. **R1:** Explicit 2-way expansion modal (Sub-items vs Steps) with clean conversion flows and non-hybrid structural invariant.
2. **R2:** Multi-parent bulk addition supporting Single, Multi-line List, and Numbered patterns with per-parent sibling deduplication and unique UID assignment.
3. **R3:** Unified Bulk Step Diffing Editor implementing Set-Union addition (no duplicates) and Set-Difference removal (silent skip on missing steps, completed step protection).
4. **R4:** Individual and bulk date management with ISO validation, conflict auto-resolution, and 1-tap quick presets.
5. **R5:** Serene, uncluttered mobile-first UI with responsive selection controls, a floating bottom action bar, and single-surface bottom sheets.
6. **Acceptance Criteria & Verification:** Concrete Vitest test suite matrix and agent-as-judge automated verification protocols.

---

## 5. Verification Method

To independently verify the specification and baseline codebase:

1. **Run Vitest Test Suite:**
   ```bash
   npm test -- src/lib/blueprintStudio.test.ts
   npm test -- src/lib/studioWorkspace.test.ts
   ```
   *Expected result:* All unit tests pass with zero failures.

2. **Inspect Specification Artifact:**
   - Open and review `d:\Production\Projects\YouDO\.agents\teamwork\spec_miner_survey_1\analysis.md`.
   - Verify that Sections 2 (Features Discovered Table), 3 (Edge Cases Table), 4–8 (R1–R5 Detailed Specifications), 9 (Data Contracts), and 10 (Acceptance Criteria Matrix) are fully populated.

3. **Check Interface Compliance:**
   - Confirm props interface in `src/App.tsx` (lines 1600–1611) matches `BlueprintStudioProps` defined in `analysis.md`.
