# Domain Algorithms Boundary & Whitespace Audit

**Agent**: M1 It2 Explorer 2 (`m1_it2_explorer_2`)  
**Role**: Boundary & Whitespace Auditor  
**Milestone**: Milestone 1 Iteration 2 (Core Domain & Algorithm Layer)  
**Date**: 2026-10-08  
**Scope**: `src/lib/blueprintStudio.ts` and `src/lib/studioWorkspace.ts`  

---

## 1. Executive Summary

Following Challenger 2's discovery in Iteration 1 Gate that whitespace-only strings (`'   '`) in `setGoalDatesBulk` caused property pollution with empty string `""` (`node.startDate = ""`), this investigation conducted an exhaustive audit of all domain algorithms in `src/lib/blueprintStudio.ts` and `src/lib/studioWorkspace.ts`.

### Key Findings
1. **`diffBlueprintSteps` is ROBUST**:
   - Whitespace-only additions (e.g., `['   ']`, `['', ' \t ' ]`) are filtered out via `normalizeBlueprintTitles`.
   - Whitespace-only removals (e.g., `['   ']`, `['']`) are filtered out via `.filter(k => k.length > 0)`.
   - When given solely whitespace additions and removals, `diffBlueprintSteps` exits early and returns the input `goals` tree unmodified (`affectedCount: 0`).
2. **`addBlueprintChildrenBulk` is ROBUST**:
   - Whitespace-only titles are filtered out by `normalizeBlueprintTitles`.
   - When raw titles contain only whitespace/empty strings, it returns early with `count: 0` and the input `goals` unmodified. No empty nodes are created.
3. **`convertNodeToBranch` & `convertNodeToTask` are ROBUST**:
   - `convertNodeToBranch` filters whitespace-only `initialChildTitles` via `normalizeBlueprintTitles`. Zero empty children created.
   - `convertNodeToTask` filters whitespace-only `initialSteps` via `normalizeBlueprintTitles`. Sets `steps: []` and `stepDone: []`.
4. **Primary Bug Confirmed**:
   - `setGoalDatesBulk` (`src/lib/blueprintStudio.ts` lines 671–674) fails to treat whitespace-only strings as clear operations because it tests `dates.startDate === ''` instead of `dates.startDate.trim() === ''`.
5. **Secondary Critical Vulnerability Discovered in `patchStudioItems` (`src/lib/studioWorkspace.ts`)**:
   - In `patchStudioItems` (lines 20–25), clearing dates via `{ startDate: '' }` or `{ startDate: null }` pollutes the node with `startDate: ""` or `startDate: null` (violating `startDate?: string`).
   - Passing whitespace `{ startDate: '   ' }` fails `isValidISODate` and reverts to the previous date rather than clearing it.
   - Passing whitespace description `{ description: '   ' }` pollutes the node with whitespace instead of deleting the property as `updateBlueprintNodes` does.
6. **Defensive Hardening Opportunity in `convertExistingSteps`**:
   - If a parent node already contains a corrupt/blank step (`steps: ['   ']`), converting existing steps in `convertNodeToBranch` or `addBlueprintChildrenBulk` creates a child node with `title: ""`. Hardening with `stepTitle.trim() || 'Step ${idx + 1}'` or skipping empty steps eliminates this risk.

---

## 2. In-Depth Algorithm Audit

### A. `diffBlueprintSteps` (`src/lib/blueprintStudio.ts` lines 346–465)

#### Code Path Analysis:
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

#### Evaluation:
1. **Step Additions (`rawStepsToAdd = ['   ', '\t\n ']`)**:
   - `normalizeBlueprintTitles` evaluates each string: `clean = value.trim().replace(/\s+/g, ' ')`.
   - `if (!clean || seen.has(key)) continue;` drops whitespace-only strings.
   - Result: `cleanToAdd = []`. Zero steps added.
2. **Step Removals (`rawStepsToRemove = ['   ', '']`)**:
   - `.map(s => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase())` yields `""`.
   - `.filter(k => k.length > 0)` removes `""`.
   - Result: `removeKeys = Set(0)`. Zero steps removed.
3. **Early Exit Guard (Line 365)**:
   - When `cleanToAdd.length === 0 && removeKeys.size === 0`, it returns `{ goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0, protectedCount: 0 }`.
   - Referential identity of `goals` is strictly preserved (`r.goals === goals`).
4. **Mixed Additions & Removals**:
   - Input: `rawStepsToAdd = ['  Step A  ', '   ', 'Step B']`.
   - Normalization collapses internal whitespace and trims: `['Step A', 'Step B']`.
   - Input: `rawStepsToRemove = ['  existing step  ', '   ']`.
   - Evaluates to `removeKeys = Set(['existing step'])`. The whitespace entry is discarded.
5. **Verdict**: **COMPLETELY SAFE**. No whitespace pollution or boundary defects.

---

### B. `addBlueprintChildrenBulk` (`src/lib/blueprintStudio.ts` lines 179–260)

#### Code Path Analysis:
```ts
185: const titles = normalizeBlueprintTitles(rawTitles);
186: if (titles.length === 0 || parentIds.length === 0) {
187:   return { goals, count: 0, createdIds: [] };
188: }
```

#### Evaluation:
1. **Whitespace-Only Titles (`rawTitles = ['   ', '']`)**:
   - `normalizeBlueprintTitles` filters out all empty/whitespace strings.
   - `titles.length === 0` triggers immediate early exit.
   - Result: `{ goals, count: 0, createdIds: [] }`. Tree is untouched.
2. **Mixed Titles (`rawTitles = ['  Child A  ', '   ', 'Child B']`)**:
   - Normalized to `['Child A', 'Child B']`.
   - Whitespace collapsed, empty item dropped.
   - Deduplicated against existing parent siblings case-insensitively.
3. **Invalid Parent IDs (`parentIds = ['   ', '']`)**:
   - `findGoal(next, parentId)` returns `undefined`.
   - Loop continues silently without mutation. Returns `{ goals, count: 0, createdIds: [] }`.
4. **`convertExistingSteps` with Whitespace Titles**:
   - If `rawTitles = ['   ']` and `convertExistingSteps: true`: line 186 exits early, meaning no conversion happens without new child items.
   - If `rawTitles = ['Valid Child']` and `convertExistingSteps: true`, but parent already had corrupt whitespace steps (e.g. `['   ']`), see Section 5 below.
5. **Verdict**: **COMPLETELY SAFE** for incoming titles.

---

### C. `convertNodeToBranch` (`src/lib/blueprintStudio.ts` lines 69–122)

#### Code Path Analysis:
```ts
79: const titles = normalizeBlueprintTitles(initialChildTitles);
...
98: const existingTitles = new Set([
99:   ...target.children.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
100:  ...convertedStepNodes.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
101: ]);
102: 
103: const newChildNodes = titles
104:   .filter((title) => !existingTitles.has(title.toLocaleLowerCase()))
105:   .map((title) => makeBlueprintNode(kind, title));
```

#### Evaluation:
1. **Whitespace-Only Initial Titles (`initialChildTitles = ['   ', '']`)**:
   - Normalized to `titles = []`.
   - `newChildNodes = []`.
   - No blank child nodes are appended.
2. **Mixed Initial Titles**:
   - All strings normalized, deduplicated against existing children.
3. **Step Conversion (`convertExistingSteps: true`)**:
   - If parent steps are well-formed, converted to child nodes with retained completion status.
4. **Verdict**: **COMPLETELY SAFE** for `initialChildTitles`.

---

### D. `convertNodeToTask` (`src/lib/blueprintStudio.ts` lines 130–153)

#### Code Path Analysis:
```ts
142: const steps = normalizeBlueprintTitles(initialSteps);
143: 
144: return goals.map((root) =>
145:   updateNode(root, nodeId, (node) => ({
146:     ...node,
147:     kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
148:     steps,
149:     stepDone: steps.map(() => false),
150:     completed: false,
151:   })),
152: );
```

#### Evaluation:
1. **Whitespace-Only Initial Steps (`initialSteps = ['   ', '']`)**:
   - Normalized to `steps = []`.
   - Node initialized with `steps: []`, `stepDone: []`, `completed: false`.
2. **Guards**:
   - Rejects conversion if `target.kind === 'goal'` or `target.children.length > 0`.
3. **Verdict**: **COMPLETELY SAFE**.

---

## 3. Comprehensive Audit of All Other Functions in `src/lib/blueprintStudio.ts`

| # | Function | Whitespace / Boundary Handling | Safety Status |
|---|----------|--------------------------------|---------------|
| 1 | `normalizeBlueprintTitles` | Trims, collapses internal spaces, deduplicates case-insensitively, rejects empty/whitespace. | **SAFE** |
| 2 | `numberedBlueprintTitles` | Trims prefix; falls back to `'Item'` if blank. Clamps `start >= 0`, `count` between 1 and 100. | **SAFE** |
| 3 | `makeBlueprintNode` | Calls `title.trim()`. Callers supply normalized non-empty strings. | **SAFE** |
| 4 | `addBlueprintChildren` | Wraps `normalizeBlueprintTitles` and delegates to `addBlueprintChildrenBulk`. | **SAFE** |
| 5 | `collectBlueprintStepsSummary` | Line 514: `if (!key) return;` skips empty or whitespace-only steps in dirty data. | **SAFE** |
| 6 | `addBlueprintSteps` | Delegates to `diffBlueprintSteps`. | **SAFE** |
| 7 | `removeBlueprintSteps` | Delegates to `diffBlueprintSteps`. | **SAFE** |
| 8 | `isValidISODate` | Rejects non-string, whitespace, invalid formats, invalid calendar dates (leap years, month bounds). | **SAFE** |
| 9 | `validateGoalDates` | Trims dates. Bypasses check if empty. Rejects invalid formats. | **SAFE** |
| 10 | `setGoalDatesBulk` | **DEFECT**: Lines 671–672 check `=== ''` instead of `.trim() === ''`. Whitespace inputs write `""`. | **NEEDS FIX** |
| 11 | `setGoalDates` | Delegates to `setGoalDatesBulk`. | Inherits fix |
| 12 | `renameBlueprintStep` | Line 769: `const title = rawTitle.trim().replace(/\s+/g, ' '); if (!title) return goals;` Rejects blank renames. | **SAFE** |
| 13 | `updateBlueprintNodes` | Line 789–795: Rejects whitespace titles (`if (!title) continue;`). Deletes `description` if whitespace (`if (description) ... else delete ...`). | **SAFE** (Gold Standard) |
| 14 | `renameBlueprintNodes` | Delegates to `updateBlueprintNodes`. | **SAFE** |
| 15 | `findBlueprintNodeDescription` | Returns string or `''`. | **SAFE** |
| 16 | `removeBlueprintNodes` | Filters empty target sets; ignores redundant targets. | **SAFE** |
| 17 | `flattenBlueprint` | Standard recursive tree walk. | **SAFE** |
| 18 | `countBlueprintNodes` | Length of flattened tree. | **SAFE** |
| 19 | `maxBlueprintDepth` | Safely handles empty trees (`Math.max(0, ...)`). | **SAFE** |
| 20 | `findBlueprintPath` | Safely handles missing node IDs (returns `[]`). | **SAFE** |
| 21 | `closestBlueprintPathIds` | Safely falls back along ancestor chain. | **SAFE** |
| 22 | `blueprintReviewState` | Normalizes step strings with `.trim().toLocaleLowerCase()`. | **SAFE** |
| 23 | `blueprintChildrenAt` | Returns children or goals if null. | **SAFE** |
| 24 | `groupBlueprintChildren` | Line 950: `if (!key) continue;` skips empty titles. | **SAFE** |
| 25 | `reconcileBlueprintTasks` | Pure task mirroring with immutable snapshot protection. | **SAFE** |

---

## 4. Secondary Critical Vulnerability Discovered: `patchStudioItems`

In `src/lib/studioWorkspace.ts` (Layer 1 domain logic), lines 16–29:

```ts
16: const next = { ...node, ...patch, children: changedChildren ? children : node.children };
17: if (patch?.title !== undefined) next.title = patch.title.trim() || node.title;
18: 
19: // Sanitize dates if patched
20: if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
21:   if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
22: }
23: if (patch?.endDate !== undefined && patch.endDate !== null && patch.endDate !== '') {
24:   if (!isValidISODate(patch.endDate)) next.endDate = node.endDate;
25: }
```

### Empirical Probe Verification:
When patching a node:
1. **Empty string `patch = { startDate: '' }`**:
   - Line 16 sets `next.startDate = ''`.
   - Line 20 condition `patch.startDate !== ''` is `false`, so line 21 does NOT run.
   - Result: `next.startDate` is **`""`** (empty string pollution!).
2. **Null `patch = { startDate: null }`**:
   - Line 16 sets `next.startDate = null`.
   - Line 20 condition `patch.startDate !== null` is `false`.
   - Result: `next.startDate` is **`null`** (violates TypeScript interface `startDate?: string`).
3. **Whitespace string `patch = { startDate: '   ' }`**:
   - Line 16 sets `next.startDate = '   '`.
   - Line 20 condition `patch.startDate !== ''` is `true`.
   - `!isValidISODate('   ')` is `true`.
   - Line 21 runs: `next.startDate = node.startDate`.
   - Result: Instead of clearing the date, it **reverts to the old date**!
4. **Description with whitespace or empty string `patch = { description: '   ' }`**:
   - Line 16 sets `next.description = '   '`.
   - Result: Description is polluted with whitespace string instead of being deleted.

---

## 5. Defensive Hardening Opportunity: `convertExistingSteps`

In `convertNodeToBranch` (line 88) and `addBlueprintChildrenBulk` (line 213):
```ts
convertedStepNodes = parentSteps.map((stepTitle, idx) => ({
  id: uid('goal'),
  kind: 'node' as const,
  title: stepTitle.trim(),
  ...
}));
```

### Observation:
If an existing endpoint task in dirty or legacy data has an empty/whitespace step (e.g. `steps: ['Valid Step', '   ']`), converting existing steps creates a child node with `title: ""`:
```json
{ "id": "goal-xxx", "kind": "node", "title": "", "children": [] }
```

### Remediation:
Filter out whitespace-only steps or provide a fallback name:
```ts
const cleanStepTitle = stepTitle.trim().replace(/\s+/g, ' ');
title: cleanStepTitle || `Step ${idx + 1}`
```
Or skip converted nodes whose title is empty.

---

## 6. Concrete Remediation Proposals for Worker

### Fix 1 (Required — Milestone 1 Gate): `src/lib/blueprintStudio.ts` lines 671–674
```ts
// BEFORE:
const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;

// AFTER:
const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
```

### Fix 2 (Recommended — Domain Consistency): `src/lib/studioWorkspace.ts` lines 19–29
```ts
// BEFORE:
if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
  if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
}
if (patch?.endDate !== undefined && patch.endDate !== null && patch.endDate !== '') {
  if (!isValidISODate(patch.endDate)) next.endDate = node.endDate;
}

// AFTER:
if (patch?.startDate !== undefined) {
  if (patch.startDate === null || (typeof patch.startDate === 'string' && patch.startDate.trim() === '')) {
    delete next.startDate;
  } else if (!isValidISODate(patch.startDate)) {
    next.startDate = node.startDate;
  } else {
    next.startDate = patch.startDate.trim();
  }
}
if (patch?.endDate !== undefined) {
  if (patch.endDate === null || (typeof patch.endDate === 'string' && patch.endDate.trim() === '')) {
    delete next.endDate;
  } else if (!isValidISODate(patch.endDate)) {
    next.endDate = node.endDate;
  } else {
    next.endDate = patch.endDate.trim();
  }
}
if (patch?.description !== undefined) {
  const cleanDesc = patch.description?.trim();
  if (cleanDesc) next.description = cleanDesc;
  else delete next.description;
}
```

### Fix 3 (Defensive Enhancement): `convertExistingSteps` step sanitization
In both `convertNodeToBranch` and `addBlueprintChildrenBulk`:
```ts
// Ensure converted step child titles cannot be empty
const cleanStepTitle = stepTitle.trim().replace(/\s+/g, ' ');
title: cleanStepTitle || `Step ${idx + 1}`
```

---

## 7. Audit Conclusion Matrix

| Target Algorithm / Area | Current Handling | Vulnerability Risk | Worker Action Required |
|---|---|---|---|
| `diffBlueprintSteps` additions | `normalizeBlueprintTitles` | None (Filters whitespace) | None (Approved) |
| `diffBlueprintSteps` removals | `.filter(k => k.length > 0)` | None (Filters whitespace) | None (Approved) |
| `addBlueprintChildrenBulk` titles | `normalizeBlueprintTitles` | None (Rejects whitespace) | None (Approved) |
| `convertNodeToBranch` initial titles | `normalizeBlueprintTitles` | None (Filters whitespace) | None (Approved) |
| `convertNodeToTask` initial steps | `normalizeBlueprintTitles` | None (Filters whitespace) | None (Approved) |
| `setGoalDatesBulk` | `dates.startDate === ''` | **High: Sets `startDate: ""`** | **Apply Fix 1** |
| `patchStudioItems` dates | `patch.startDate !== ''` | **High: Sets `""`, `null`, reverts** | **Apply Fix 2** |
| `convertExistingSteps` step conversion | `stepTitle.trim()` | Low: Creates `title: ""` on corrupt data | **Apply Fix 3** |
