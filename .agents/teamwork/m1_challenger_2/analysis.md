# Adversarial Challenge Analysis — Milestone 1: Core Domain & Algorithm Layer

**Agent**: Challenger 2 (`m1_challenger_2`)  
**Scope**: `setGoalDatesBulk`, `validateGoalDates`, `convertNodeToBranch`, `convertNodeToTask`  
**Test Harness**: `src/lib/blueprintStudio.adversarial.test.ts` (28 Vitest tests, 18ms execution)

---

## Challenge Summary

**Overall risk assessment**: **MEDIUM**

While the core algorithms exhibit outstanding performance, architectural purity, and strict invariant enforcement across node expansion and ISO calendar validation, an empirical flaw was discovered in `setGoalDatesBulk`: passing whitespace-only strings (e.g. `' '` or `'   '`) bypasses `clearStart` / `clearEnd` and writes an invalid empty string `""` to the `GoalNode` model instead of clearing or deleting the property.

---

## Challenges

### [Medium] Challenge 1: Whitespace-Only String in `setGoalDatesBulk` Pollutes `GoalNode.startDate` / `endDate` with `""`

- **Assumption Challenged**:
  The implementation assumes that checking `dates.startDate === ''` and `dates.endDate === ''` is sufficient to detect when a caller wants to clear a date field, and that `dates.startDate.trim()` can safely be assigned if `newStart !== undefined`.
- **Attack Scenario**:
  A caller (or UI form field when a user highlights and presses space or backspace/space) passes `{ startDate: '   ' }` or `{ endDate: '   ' }`.
  1. `validateGoalDates` trims the string (`start = dates.startDate?.trim()`), evaluates `start === ''`, skips the `isValidISODate` check, and returns `{ valid: true }`.
  2. In `setGoalDatesBulk` (lines 671–674 of `src/lib/blueprintStudio.ts`):
     ```ts
     const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
     const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
     const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
     ```
     `dates.startDate === ''` evaluates to `false` because `'   ' !== ''`.
     Therefore, `clearStart` is `false`.
     `newStart` is assigned `dates.startDate.trim()`, which is `""`.
  3. In the node visitor (lines 695–699 & line 744):
     `finalStart` is assigned `newStart` (`""`).
     `updated.startDate = finalStart` sets `updated.startDate = ""`.
- **Blast Radius**:
  The `GoalNode` interface (`src/types.ts` line 46) specifies:
  ```ts
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  ```
  An empty string `""` is not a valid ISO date (`isValidISODate("") === false`).
  Furthermore, downstream functions such as `patchStudioItems` in `src/lib/studioWorkspace.ts` (lines 20–25) enforce:
  ```ts
  if (patch.startDate !== undefined && patch.startDate !== null && patch.startDate !== '') {
    if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;
  }
  ```
  Having `startDate: ""` breaks invariants where consumer modules check `'startDate' in node` or expect either a valid `YYYY-MM-DD` string or `undefined`.
- **Mitigation**:
  Update lines 671–672 in `src/lib/blueprintStudio.ts` to normalize whitespace before checking emptiness:
  ```ts
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
  ```
  This guarantees that `'   '` is recognized as a clear command and deletes the property, matching the behavior of `""` and `null`.

---

## Positive Stress Test Findings (Verified Robust)

### 1. Calendar Validation & Leap Year Arithmetic (`validateGoalDates` & `isValidISODate`)
- **Century & Leap Year Rules**:
  - `2024-02-29` (divisible by 4, leap year): **PASS** (`true`).
  - `2025-02-29` (non-leap year): **PASS** (`false`).
  - `2026-02-29` (non-leap year): **PASS** (`false`).
  - `2000-02-29` (century divisible by 400, leap year): **PASS** (`true`).
  - `1900-02-29` (century NOT divisible by 400, non-leap year): **PASS** (`false`).
  - `2100-02-29` (century NOT divisible by 400, non-leap year): **PASS** (`false`).
- **Calendar Month Length Boundaries**:
  - `2026-02-30`, `2026-02-31`: **PASS** (`false`).
  - 30-day months probed with 31st day (`2026-04-31`, `2026-06-31`, `2026-09-31`, `2026-11-31`): **PASS** (all correctly returned `false`).
  - 31-day months probed with 31st day (Jan, Mar, May, Jul, Aug, Oct, Dec): **PASS** (all returned `true`).
  - Out of range months (`2026-00-15`, `2026-13-15`): **PASS** (`false`).
  - Out of range days (`2026-01-00`, `2026-01-32`): **PASS** (`false`).
- **Formatting & Malformed Inputs**:
  - Slashes (`2026/05/01`), unpadded (`2026-5-1`), non-ISO (`01-05-2026`), strings (`abc`), ISO timestamps (`2026-05-01T00:00:00Z`): **PASS** (all returned `false`).
  - Non-string types (`null`, `undefined`, numbers, objects): **PASS** (all returned `false` without throwing).
- **Inverted Ranges**:
  - `startDate: '2026-05-10', endDate: '2026-05-01'`: **PASS** (`valid: false`, rejected with descriptive error).
  - Single-day span `startDate === endDate`: **PASS** (`valid: true`).

### 2. Conflict Resolution Policies in `setGoalDatesBulk`
- **Policy `'clear'` (Default)**:
  - New `startDate` > existing `endDate`: Clears existing `endDate`, sets `startDate`. `adjustedCount: 1`. **PASS**.
  - New `endDate` < existing `startDate`: Clears existing `startDate`, sets `endDate`. `adjustedCount: 1`. **PASS**.
- **Policy `'clamp'`**:
  - New `startDate` > existing `endDate`: Clamps `endDate` forward to match `startDate`. `adjustedCount: 1`. **PASS**.
  - New `endDate` < existing `startDate`: Clamps `startDate` backward to match `endDate`. `adjustedCount: 1`. **PASS**.
- **Policy `'skip'`**:
  - Conflicting nodes are completely skipped. Node dates remain unmodified. `count: 0`. **PASS**.
  - Multi-node targeting with mixed conflict states: Conflicting node skipped, non-conflicting nodes updated. `count: 2, adjustedCount: 0`. **PASS**.
- **Date Clearing**:
  - Clearing via `startDate: null, endDate: null`: Deletes properties. **PASS**.
  - Clearing via `startDate: '', endDate: ''`: Deletes properties. **PASS**.
  - Clearing via `clearAll: true`: Deletes properties. **PASS**.

### 3. Flexible Node Expansion & Conversion Semantics
- **`convertNodeToBranch`**:
  - Converting leaves: Transforms `kind: 'leaf'` to `'node'`, adds child nodes, deletes `steps` and `stepDone`, resets `todayTaskId: null`. **PASS**.
  - Converting tasks (`convertExistingSteps: false`): Deletes steps cleanly, appends child nodes. **PASS**.
  - Converting tasks (`convertExistingSteps: true`): Converts each step into a child `GoalNode` while preserving individual step completion state (`completed: Boolean(parentStepDone[idx])`). **PASS**.
  - Completion rollup: If all steps were completed and converted with no new unfinished children, parent `completed` rolls up to `true`. If any child is unfinished, parent `completed` is `false`. **PASS**.
  - Sibling deduplication: Case-insensitively deduplicates initial child titles against existing children and converted steps. **PASS**.
- **`convertNodeToTask`**:
  - Converting empty leaves: Creates normalized steps, initializes `stepDone` to parallel `false` array, resets `completed: false`. **PASS**.
  - Normalizing steps: Trims whitespace, collapses inner runs, eliminates duplicates case-insensitively. **PASS**.
  - Invariant protection: Nodes with active children (`children.length > 0`) and root goals (`kind === 'goal'`) are strictly protected from task conversion. Operation is rejected and tree returned untouched. **PASS**.

### 4. Tree Immutability & Structural Sharing
- Probed using recursive `deepFreeze` on input trees.
- Calling `convertNodeToBranch`, `convertNodeToTask`, and `setGoalDatesBulk` throws zero mutation errors.
- Unaffected sibling subtrees retain exact referential identity (`res[0].children[1] === original[0].children[1]`), confirming structural sharing.
- Handled deep trees (depth 50) and large bulk sets (500 nodes) in <20ms without recursion or memory exhaustion.

---

## Stress Test Results

| # | Scenario | Expected Behavior | Actual Behavior | Pass/Fail |
|---|---|---|---|---|
| 1 | Leap year `2024-02-29` | Valid ISO date | `true` | **PASS** |
| 2 | Non-leap year `2025-02-29` | Invalid date | `false` | **PASS** |
| 3 | Non-leap year `2026-02-29` | Invalid date | `false` | **PASS** |
| 4 | Century leap year `2000-02-29` | Valid ISO date | `true` | **PASS** |
| 5 | Century non-leap `1900-02-29` & `2100-02-29` | Invalid date | `false` | **PASS** |
| 6 | April 31st (`2026-04-31`) | Invalid date | `false` | **PASS** |
| 7 | Month 00 / 13 / Day 00 / Day 32 | Invalid date | `false` | **PASS** |
| 8 | Slash format `2026/05/01` | Invalid format | `false` | **PASS** |
| 9 | Inverted dates `startDate > endDate` | Validation error | `valid: false` | **PASS** |
| 10 | Conflict policy `'clear'` | Clears opposing date | `endDate: undefined` | **PASS** |
| 11 | Conflict policy `'clamp'` | Clamps opposing date | `endDate: startDate` | **PASS** |
| 12 | Conflict policy `'skip'` | Skips conflicting node | Node untouched | **PASS** |
| 13 | Date clear via `null` | Deletes property | `startDate: undefined` | **PASS** |
| 14 | Date clear via `""` | Deletes property | `startDate: undefined` | **PASS** |
| 15 | Date clear via `clearAll: true` | Deletes both dates | Both `undefined` | **PASS** |
| 16 | Date clear via whitespace `'   '` | Deletes property | Sets `startDate: ""` (defect) | **FAIL** |
| 17 | `convertNodeToBranch` leaf conversion | Creates children, deletes steps | Correct | **PASS** |
| 18 | `convertNodeToBranch` step conversion | Converts steps to child nodes | Preserves completed | **PASS** |
| 19 | `convertNodeToBranch` full complete rollup | Parent rolls up to `completed: true` | `completed: true` | **PASS** |
| 20 | `convertNodeToTask` leaf conversion | Sets steps & `stepDone: [false]` | Correct | **PASS** |
| 21 | `convertNodeToTask` branch guard | Protects nodes with children | Rejected, tree untouched | **PASS** |
| 22 | `convertNodeToTask` root goal guard | Protects `kind: 'goal'` | Rejected, tree untouched | **PASS** |
| 23 | Deep-freeze tree immutability | Zero mutations on inputs | Immutability maintained | **PASS** |
| 24 | Structural sharing on unaffected nodes | Referential identity preserved | `next === prev` | **PASS** |

---

## Unchallenged Areas

- `diffBlueprintSteps` and `addBlueprintChildrenBulk` were surveyed for compatibility but assigned to Challenger 1 (`m1_challenger_1`).
- UI Modal presentation components and reducer interactions (`blueprintStudioState.ts`) belong to Milestone 3 / Milestone 4.
