# Milestone 1 Iteration 2: Boundary & Whitespace Auditor Handoff Report

**Agent**: M1 It2 Explorer 2 (`m1_it2_explorer_2`)  
**Roles**: Explorer, Domain Specialist (Boundary & Whitespace Auditor)  
**Milestone**: Milestone 1 Iteration 2: Core Domain & Algorithm Layer  
**Date**: 2026-10-08  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_it2_explorer_2`  
**Target Files**: `src/lib/blueprintStudio.ts`, `src/lib/studioWorkspace.ts`  

---

## 1. Observation

1. **`diffBlueprintSteps` (`src/lib/blueprintStudio.ts` lines 358–367)**:
   ```ts
   358: const cleanToAdd = normalizeBlueprintTitles(rawStepsToAdd);
   359: const removeKeys = new Set(
   360:   rawStepsToRemove
   361:     .map((s) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase())
   362:     .filter((k) => k.length > 0),
   363: );
   364: 
   365: if (cleanToAdd.length === 0 && removeKeys.size === 0) {
   366:   return { goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0, protectedCount: 0 };
   367: }
   ```
   - Running probe with whitespace additions `rawStepsToAdd: ['   ', '\t\n ']`:
     `normalizeBlueprintTitles` filters all entries (`cleanToAdd = []`).
     `addedCount = 0`, `affectedCount = 0`, tree reference untouched.
   - Running probe with whitespace removals `rawStepsToRemove: ['   ', '']`:
     `.filter(k => k.length > 0)` filters all entries (`removeKeys = Set(0)`).
     `removedCount = 0`, `affectedCount = 0`, tree reference untouched.
   - Running probe with mixed additions `['  Step A  ', '   ', 'Step B']`:
     Collapses whitespace, drops `'   '`, adds exactly `['Step A', 'Step B']`.

2. **`addBlueprintChildrenBulk` (`src/lib/blueprintStudio.ts` lines 185–188)**:
   ```ts
   185: const titles = normalizeBlueprintTitles(rawTitles);
   186: if (titles.length === 0 || parentIds.length === 0) {
   187:   return { goals, count: 0, createdIds: [] };
   188: }
   ```
   - Running probe with whitespace-only titles `rawTitles: ['   ', '\t\n ']`:
     `titles = []`. Line 186 triggers early return:
     `{"count": 0, "createdIds": [], "sameRef": true}`.
     No child nodes created. Tree reference untouched.
   - Running probe with mixed titles `['  Child A  ', '   ', 'Child B']`:
     Normalized to `['Child A', 'Child B']`. Sibling deduplication applies per-parent.

3. **`convertNodeToBranch` & `convertNodeToTask` (`src/lib/blueprintStudio.ts` lines 79, 142)**:
   - In `convertNodeToBranch`:
     Line 79: `const titles = normalizeBlueprintTitles(initialChildTitles);`
     Passing `initialChildTitles: ['   ', '']` results in `titles: []`, appending zero children.
   - In `convertNodeToTask`:
     Line 142: `const steps = normalizeBlueprintTitles(initialSteps);`
     Passing `initialSteps: ['   ', '']` results in `steps: []`, `stepDone: []`.

4. **Empirical Defect Verified in `setGoalDatesBulk` (`src/lib/blueprintStudio.ts` lines 671–674 & 744)**:
   ```ts
   671: const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
   672: const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
   673: const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
   674: const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
   ```
   - Running probe `setGoalDatesBulk(tree, ['n1'], { startDate: '   ', endDate: '   ' })`:
     `dates.startDate === ''` evaluates to `false` because `'   ' !== ''`.
     `clearStart = false`.
     `newStart = '   '.trim() = ""`.
     Line 744: `updated.startDate = ""` executes.
     Node output: `{"startDate": "", "endDate": "", "count": 1}`.
     Property polluted with empty string `""` instead of being deleted.

5. **Secondary Critical Vulnerability Discovered in `patchStudioItems` (`src/lib/studioWorkspace.ts` lines 20–25)**:
   ```ts
   20: if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
   21:   if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
   22: }
   ```
   - Running probe `patchStudioItems(tree, { n1: { startDate: '' } })`:
     Output: `{"startDate": ""}`.
   - Running probe `patchStudioItems(tree, { n1: { startDate: null } })`:
     Output: `{"startDate": null}` (violates `startDate?: string`).
   - Running probe `patchStudioItems(tree, { n1: { startDate: '   ' } })`:
     `patch.startDate !== ''` is `true`. `!isValidISODate('   ')` is `true`.
     Reverts `next.startDate = node.startDate`. Date is NOT cleared.
   - Running probe `patchStudioItems(tree, { n1: { description: '   ' } })`:
     Leaves `description: "   "` instead of deleting the property.

6. **Defensive Boundary Observation in `convertExistingSteps`**:
   - In `convertNodeToBranch` (line 88) and `addBlueprintChildrenBulk` (line 213):
     `title: step.trim()` or `title: stepTitle.trim()`.
     If dirty/legacy data contains `steps: ['   ']`, converting steps produces a child node with `title: ""`.

---

## 2. Logic Chain

1. **Safety of Core Bulk Operations (Observations 1, 2, 3)**:
   - `diffBlueprintSteps`, `addBlueprintChildrenBulk`, `convertNodeToBranch`, and `convertNodeToTask` all route incoming user inputs through `normalizeBlueprintTitles`.
   - `normalizeBlueprintTitles` strips all leading and trailing whitespace, collapses multiple internal spaces into a single space, deduplicates entries case-insensitively, and drops any string whose trimmed length is 0.
   - Furthermore, `diffBlueprintSteps` filters `rawStepsToRemove` using `.filter(k => k.length > 0)`, and both algorithms feature immediate early-exit guards when the cleaned input array is empty.
   - Therefore, step diffing, bulk child creation, and node conversion are already defensively hardened against whitespace-only inputs and produce zero empty nodes or steps.

2. **Root Cause and Scope of Date Pollution (Observation 4)**:
   - `GoalNode.startDate` and `endDate` are defined as optional ISO date strings (`startDate?: string`).
   - The intended clearing representation across the domain is `undefined` (deleting the property).
   - In `setGoalDatesBulk`, checking `dates.startDate === ''` instead of `dates.startDate.trim() === ''` allows `'   '` to bypass `clearStart`, become `newStart = ""`, and get assigned to `updated.startDate`.
   - The fix requires updating lines 671–672 to check `(typeof dates.startDate === 'string' && dates.startDate.trim() === '')`.

3. **Need for Domain Consistency Across Layers (Observation 5)**:
   - `patchStudioItems` in `src/lib/studioWorkspace.ts` belongs to Layer 1 (Domain Logic Layer).
   - It performs in-place field updates on nodes.
   - Because it copies `patch` fields via `{ ...node, ...patch }` and only resets invalid non-empty strings, passing `''`, `null`, or `'   '` introduces invalid types (`null`), polluted strings (`""`), or fails to clear the field.
   - Aligning `patchStudioItems` with `setGoalDatesBulk` guarantees uniform date and description clearing behavior across the entire domain layer.

4. **Defensive Step Conversion Hardening (Observation 6)**:
   - While modern step entry points prevent empty steps, legacy trees or external imports could contain blank steps.
   - Adding a fallback title (`cleanTitle || `Step ${idx + 1}``) or filtering empty steps ensures `GoalNode.title` is never `""`.

---

## 3. Caveats

- **Scope Boundary**: As an Explorer, this report provides read-only investigation and verified recommendations. No production source files were modified during this audit.
- **Worker Execution**: The implementation worker (`m1_worker`) must apply the fixes in `src/lib/blueprintStudio.ts` (and optionally `src/lib/studioWorkspace.ts`), followed by test assertion updates in `src/lib/blueprintStudio.adversarial.test.ts`.

---

## 4. Conclusion

1. **`diffBlueprintSteps`**: **APPROVED**. Completely handles whitespace additions and removals defensively without modifications needed.
2. **`addBlueprintChildrenBulk`**: **APPROVED**. Completely filters whitespace titles and rejects empty operations.
3. **`convertNodeToBranch` & `convertNodeToTask`**: **APPROVED**. Initial titles and steps are safely normalized.
4. **`setGoalDatesBulk`**: **ACTION REQUIRED (Milestone 1 Gate)**. Apply Fix 1 in `src/lib/blueprintStudio.ts` lines 671–672:
   ```ts
   const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
   const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
   ```
5. **`patchStudioItems`**: **RECOMMENDED (Quality Hardening)**. Apply Fix 2 in `src/lib/studioWorkspace.ts` lines 20–29 to prevent `""` and `null` pollution during detail edits.
6. **`convertExistingSteps`**: **RECOMMENDED (Defensive)**. Add `cleanTitle || 'Step ${idx + 1}'` fallback when converting legacy steps.

---

## 5. Verification Method

1. **Verify Baseline Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 46 test files and 568 tests pass.

2. **Verify Adversarial Probes with TSX**:
   ```bash
   npx tsx -e "
   import { diffBlueprintSteps, addBlueprintChildrenBulk } from './src/lib/blueprintStudio';
   const r1 = diffBlueprintSteps([], ['t1'], ['   '], ['   ']);
   console.log('diff affected:', r1.affectedCount);
   const r2 = addBlueprintChildrenBulk([], ['p1'], ['   ']);
   console.log('bulk add count:', r2.count);
   "
   ```
   *Expected Result*: `diff affected: 0`, `bulk add count: 0`.

3. **Verify the Fix in `setGoalDatesBulk` after Worker applies change**:
   ```bash
   npx vitest run src/lib/blueprintStudio.adversarial.test.ts
   ```
   *Condition for Invalidation*: If `resWhitespace.goals[0].children[0].startDate` is `""` instead of `undefined`, the bug is still present.
