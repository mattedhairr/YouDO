# Milestone 1 Iteration 2: Date Sanitization & Clearing Analysis

**Author**: M1 It2 Explorer 1 (Date Sanitization Specialist)  
**Date**: 2026-10-08  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_it2_explorer_1`  
**Reference Gate Report**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_challenger_2\handoff.md`  

---

## 1. Executive Summary

During Milestone 1 Iteration 1 Gate review, Challenger 2 identified an empirical defect in `src/lib/blueprintStudio.ts`:
When calling `setGoalDatesBulk` with whitespace-only strings (e.g. `{ startDate: '   ', endDate: '   ' }`), `validateGoalDates` passes the input as valid clearing instructions, but `setGoalDatesBulk` fails to recognize whitespace-only strings as clearing requests. Consequently, instead of removing/deleting the date property (`undefined`), it assigns `startDate: ""` and `endDate: ""` to the `GoalNode`. This violates the domain model invariant in `src/types.ts` where `startDate` and `endDate` must be ISO calendar dates (`YYYY-MM-DD`) or omitted (`undefined`), never empty strings.

This investigation provides:
1. Exact root-cause tracing in `setGoalDatesBulk` (`src/lib/blueprintStudio.ts` lines 671–674 and lines 744–749).
2. Verification and consistency audit across `validateGoalDates`, `isValidISODate`, and `patchStudioItems` (`src/lib/studioWorkspace.ts`).
3. Concrete, production-grade fix recommendations with exact before/after snippets for the Worker.

---

## 2. Root Cause Analysis in `setGoalDatesBulk`

### 2.1 The Observed Defect
In `src/lib/blueprintStudio.ts`:
```ts
670:   const isClearAll = Boolean(dates.clearAll);
671:   const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
672:   const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
673:   const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
674:   const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
```

When an input `{ startDate: '   ', endDate: '   ' }` is passed:
1. **Validation Step** (`validateGoalDates`):
   - `const start = dates.startDate?.trim();` -> `""`
   - `start !== ''` is `false`, so ISO date validation is bypassed.
   - `validateGoalDates` returns `{ valid: true }`.
2. **Clear Flag Evaluation** (lines 671–672):
   - `clearStart` checks `dates.startDate === ''`.
   - Because `'   ' !== ''`, `clearStart` evaluates to `false`.
3. **New Value Evaluation** (line 673):
   - `!clearStart` is `true`.
   - `typeof dates.startDate === 'string'` is `true`.
   - `newStart` evaluates to `dates.startDate.trim()`, which is `""`!
4. **Node Tree Mutation** (lines 695–699 & 744–748):
   - `clearStart` is `false`, so `finalStart = undefined` is not executed.
   - `newStart !== undefined` is `true` (since `newStart === "" !== undefined`), so `finalStart = ""`.
   - At line 744: `if (finalStart !== undefined) updated.startDate = finalStart;` executes and assigns `updated.startDate = ""`.
   - The date property is NOT deleted; instead, `node.startDate` holds `""`.

### 2.2 Domain Invariant Impact
In `src/types.ts`:
```ts
export interface GoalNode {
  id: string;
  kind: GoalKind;
  title: string;
  description?: string;
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  ...
}
```
An empty string `""` is not a valid ISO date:
- `isValidISODate("")` returns `false`.
- Downstream date pickers, schedulers, and filters expect either a valid `YYYY-MM-DD` string or `undefined`.
- Having `startDate: ""` causes serialization, display, and comparison bugs.

---

## 3. Consistency Inspection of Related Date Functions

### 3.1 `isValidISODate` (`src/lib/blueprintStudio.ts` lines 587–599)
```ts
export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
```
- **Evaluation**:
  - Non-strings (`null`, `undefined`, numbers) -> `false`.
  - Empty string `""` or whitespace `"   "` -> `trimmed` is `""` -> fails regex -> `false`.
  - Calendar validation accurately enforces leap years (`2024-02-29` true vs `2025-02-29` false), century leap years (`2000-02-29` true vs `1900-02-29` false), and month lengths (`2026-04-31` false).
- **Consistency**: 100% consistent. It strictly rejects whitespace and non-ISO strings. No changes required.

### 3.2 `validateGoalDates` (`src/lib/blueprintStudio.ts` lines 607–630)
```ts
export function validateGoalDates(dates: GoalDateInput): { valid: boolean; error?: string } {
  if (dates.clearAll) return { valid: true };

  const start = dates.startDate?.trim();
  const end = dates.endDate?.trim();

  if (start !== undefined && start !== null && start !== '') {
    if (!isValidISODate(start)) {
      return { valid: false, error: `Invalid start date: "${start}". Expected format YYYY-MM-DD.` };
    }
  }

  if (end !== undefined && end !== null && end !== '') {
    if (!isValidISODate(end)) {
      return { valid: false, error: `Invalid end date: "${end}". Expected format YYYY-MM-DD.` };
    }
  }

  if (start && end && start > end) {
    return { valid: false, error: `Start date (${start}) cannot be after end date (${end}).` };
  }

  return { valid: true };
}
```
- **Evaluation**:
  - Automatically trims `dates.startDate?.trim()` and `dates.endDate?.trim()`.
  - Treats empty string and whitespace-only strings as non-dates (clearing operations), allowing them to pass validation as `{ valid: true }`.
  - Rejects non-empty malformed strings (e.g. `'abc'`, `'2026-02-31'`).
  - Checks date range ordering only when both `start` and `end` are non-empty strings.
- **Consistency**: `validateGoalDates` intentionally accepts whitespace strings as valid clearing requests.
  The defect was that `setGoalDatesBulk` did not perform the same trimming when evaluating `clearStart` and `clearEnd`!

### 3.3 `patchStudioItems` (`src/lib/studioWorkspace.ts` lines 10–34)
```ts
export function patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[] {
  const visit = (node: GoalNode): GoalNode => {
    const patch = patches[node.id];
    const children = node.children.map(visit);
    const changedChildren = children.some((child, index) => child !== node.children[index]);
    if (!patch && !changedChildren) return node;
    const next = { ...node, ...patch, children: changedChildren ? children : node.children };
    if (patch?.title !== undefined) next.title = patch.title.trim() || node.title;

    // Sanitize dates if patched
    if (patch?.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
      if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
    }
    if (patch?.endDate !== undefined && patch.endDate !== null && patch.endDate !== '') {
      if (!isValidISODate(patch.endDate)) next.endDate = node.endDate;
    }
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      next.startDate = node.startDate;
      next.endDate = node.endDate;
    }

    return next;
  };
  return goals.map(visit);
}
```
- **Investigation of Current Behavior**:
  - If a patch supplies `{ startDate: '' }`, `next = { ...node, ...patch }` sets `next.startDate = ''`. Because `patch.startDate !== ''` is false, it does NOT revert or delete `next.startDate`.
  - If a patch supplies `{ startDate: '   ' }`, `patch.startDate !== ''` is true, but `!isValidISODate('   ')` is true, so it reverts `next.startDate = node.startDate`.
  - If a patch supplies `{ startDate: '  2026-10-10  ' }`, `isValidISODate` passes, but `next.startDate` retains untrimmed whitespace.
- **Recommendation**:
  `patchStudioItems` should be hardened with the exact same trimming and property-deleting discipline:
  - If `startDate` or `endDate` in patch is `null`, `undefined`, or whitespace (`trim() === ''`), `delete next.startDate` / `delete next.endDate`.
  - If it is a valid ISO date, trim it: `next.startDate = patch.startDate.trim()`.
  - If invalid, revert to `node.startDate`.

---

## 4. Exact Solution Formulation

### 4.1 Solution for `setGoalDatesBulk` (`src/lib/blueprintStudio.ts`)
Replace lines 671–674:
```ts
  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
  const newStart = !clearStart && typeof dates.startDate === 'string' && dates.startDate.trim() !== '' ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && typeof dates.endDate === 'string' && dates.endDate.trim() !== '' ? dates.endDate.trim() : undefined;
```

#### Detailed Logic Trace:
| Input `dates.startDate` | `clearStart` | `newStart` | `finalStart` | Node Mutation Result |
|---|---|---|---|---|
| `undefined` (omitted) | `false` | `undefined` | `node.startDate` | Preserved untouched |
| `null` | `true` | `undefined` | `undefined` | `delete updated.startDate` |
| `""` | `true` | `undefined` | `undefined` | `delete updated.startDate` |
| `"   "` | `true` | `undefined` | `undefined` | `delete updated.startDate` |
| `"2026-10-10"` | `false` | `"2026-10-10"` | `"2026-10-10"` | `updated.startDate = "2026-10-10"` |
| `"  2026-10-10  "` | `false` | `"2026-10-10"` | `"2026-10-10"` | `updated.startDate = "2026-10-10"` (trimmed) |
| `{ clearAll: true }` | `true` | `undefined` | `undefined` | `delete updated.startDate` |

### 4.2 Solution for `patchStudioItems` (`src/lib/studioWorkspace.ts`)
Replace lines 20–29 with:
```ts
    // Sanitize dates if patched
    if (patch && 'startDate' in patch) {
      if (patch.startDate === null || patch.startDate === undefined || (typeof patch.startDate === 'string' && patch.startDate.trim() === '')) {
        delete next.startDate;
      } else if (typeof patch.startDate === 'string' && isValidISODate(patch.startDate)) {
        next.startDate = patch.startDate.trim();
      } else {
        next.startDate = node.startDate;
      }
    }
    if (patch && 'endDate' in patch) {
      if (patch.endDate === null || patch.endDate === undefined || (typeof patch.endDate === 'string' && patch.endDate.trim() === '')) {
        delete next.endDate;
      } else if (typeof patch.endDate === 'string' && isValidISODate(patch.endDate)) {
        next.endDate = patch.endDate.trim();
      } else {
        next.endDate = node.endDate;
      }
    }
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      next.startDate = node.startDate;
      next.endDate = node.endDate;
    }
```

### 4.3 Test Adjustments Required

#### 1. Adversarial Test Suite (`src/lib/blueprintStudio.adversarial.test.ts`)
Lines 215–225 currently contain Challenger 2's reproduction probe asserting the buggy behavior:
```ts
    it('EMPIRICAL BUG REPRODUCTION: whitespace string "   " sets property to "" instead of clearing', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      // While '' clears the date property, '   ' sets the date property to an empty string ''!
      expect(resWhitespace.goals[0].children[0].startDate).toBe('');
      expect(resWhitespace.goals[0].children[0].endDate).toBe('');
      expect(isValidISODate(resWhitespace.goals[0].children[0].startDate)).toBe(false);
    });
```
Must be converted into an adversarial verification test:
```ts
    it('clears date properties when passed whitespace string "   "', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      expect(resWhitespace.goals[0].children[0].startDate).toBeUndefined();
      expect(resWhitespace.goals[0].children[0].endDate).toBeUndefined();
      expect('startDate' in resWhitespace.goals[0].children[0]).toBe(false);
      expect('endDate' in resWhitespace.goals[0].children[0]).toBe(false);
    });
```

#### 2. Domain Unit Tests (`src/lib/blueprintStudio.test.ts`)
Add a new unit test in the R4 test suite:
```ts
  it('R4-15: clears dates when passed whitespace-only strings', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBeUndefined();
    expect('startDate' in result.goals[0].children[0]).toBe(false);
    expect('endDate' in result.goals[0].children[0]).toBe(false);
  });
```

#### 3. Studio Workspace Tests (`src/lib/studioWorkspace.test.ts`)
Add a test verifying clearing dates via `patchStudioItems`:
```ts
  it('clears dates when patched with whitespace or empty strings in patchStudioItems', () => {
    const original = [item('a', [], { startDate: '2026-09-01', endDate: '2026-10-01' })];
    const cleared = patchStudioItems(original, { a: { startDate: '   ', endDate: '' } });
    expect(cleared[0].startDate).toBeUndefined();
    expect(cleared[0].endDate).toBeUndefined();
    expect('startDate' in cleared[0]).toBe(false);
    expect('endDate' in cleared[0]).toBe(false);
  });
```

---

## 5. Summary of Recommendations for Worker

1. **`src/lib/blueprintStudio.ts`**:
   - In `setGoalDatesBulk`: Replace lines 671–674 with the whitespace-trimming expressions for `clearStart`, `clearEnd`, `newStart`, `newEnd`.
2. **`src/lib/studioWorkspace.ts`**:
   - In `patchStudioItems`: Replace lines 20–29 to delete `startDate`/`endDate` when given null, undefined, or whitespace/empty strings, and trim valid dates.
3. **`src/lib/blueprintStudio.adversarial.test.ts`**:
   - Update line 215–224 from asserting `toBe('')` to asserting `toBeUndefined()`.
4. **`src/lib/blueprintStudio.test.ts`**:
   - Add test `R4-15` asserting whitespace string clearing.
5. **`src/lib/studioWorkspace.test.ts`**:
   - Add test asserting whitespace string clearing in `patchStudioItems`.
