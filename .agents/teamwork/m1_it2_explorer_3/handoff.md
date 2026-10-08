# Milestone 1 Iteration 2: Handoff Report

**Agent**: M1 It2 Explorer 3 (`m1_it2_explorer_3`)  
**Role**: Test Design Specialist / Teamwork Explorer  
**Milestone**: Milestone 1 Iteration 2  
**Date**: 2026-10-08  
**Working Directory**: `d:\Production\Projects\YouDO\.agents\teamwork\m1_it2_explorer_3`  

---

## 1. Observation

1. **Challenger 2 Empirical Defect Report**:
   - Location: `d:\Production\Projects\YouDO\.agents\teamwork\m1_challenger_2\handoff.md` Section 1.2.
   - Identified defect in `src/lib/blueprintStudio.ts` lines 671–674 and lines 744–749:
     ```ts
     671: const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
     672: const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
     673: const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
     674: const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
     ```
     When called with `{ startDate: '   ', endDate: '   ' }`, `dates.startDate === ''` evaluates to `false`, leaving `clearStart = false` and `newStart = ""`. At line 744:
     ```ts
     744: if (finalStart !== undefined) updated.startDate = finalStart;
     745: else delete updated.startDate;
     ```
     Because `finalStart === ""` is not `undefined`, `updated.startDate = ""` is executed, setting `node.startDate = ""` instead of deleting the property.

2. **Existing Test Suite Baseline**:
   - Running `npx vitest run src/lib/blueprintStudio.test.ts` executed 69 tests in 30ms (exit code 0).
   - In `src/lib/blueprintStudio.adversarial.test.ts`, line 215 reproduces this exact defect:
     ```ts
     it('EMPIRICAL BUG REPRODUCTION: whitespace string "   " sets property to "" instead of clearing', () => {
       ...
       expect(resWhitespace.goals[0].children[0].startDate).toBe('');
       expect(resWhitespace.goals[0].children[0].endDate).toBe('');
       expect(isValidISODate(resWhitespace.goals[0].children[0].startDate)).toBe(false);
     });
     ```

3. **Downstream Consumers**:
   - `src/components/GoalView.tsx` line 60: `const start = startDate ?? endDate;`. When `startDate` is `""`, `"" ?? endDate` evaluates to `""`, resulting in `new Date("T00:00:00")` producing `Invalid Date` in the UI.
   - `src/lib/studioWorkspace.ts` line 21: `if (!isValidISODate(patch.startDate)) next.startDate = node.startDate;`.
   - `src/lib/blueprintStudio.ts` line 587: `isValidISODate` strictly validates ISO `YYYY-MM-DD`. `isValidISODate("")` and `isValidISODate("   ")` return `false`.

---

## 2. Logic Chain

1. **Step 1 (Tracing the Defect)**:
   In `src/lib/blueprintStudio.ts`, `validateGoalDates` trims the input (`dates.startDate?.trim() === ''`) and accepts whitespace as a valid clearing intention (`{ valid: true }`). However, `setGoalDatesBulk` checks exact equality against empty string (`dates.startDate === ''`) rather than trimmed emptiness (`dates.startDate.trim() === ''`).
   *(Reference: Observation 1)*

2. **Step 2 (Invariant Violation)**:
   Because `clearStart` is `false`, `newStart` becomes `dates.startDate.trim()` (`""`). At line 744, `updated.startDate = ""` assigns an empty string. A `GoalNode` must have either a valid ISO date or `undefined` (deleted property). Having `startDate: ""` causes `isValidISODate("") === false` and breaks nullish coalescing in `GoalView.tsx`.
   *(Reference: Observations 1, 3)*

3. **Step 3 (Remediation Design)**:
   By updating lines 671–672 of `src/lib/blueprintStudio.ts` to:
   ```ts
   const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
   const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
   ```
   Whitespace inputs evaluate to `clearStart = true`, `newStart = undefined`, and `finalStart = undefined`. This activates line 745 (`delete updated.startDate`), completely deleting the property and leaving `node.startDate === undefined`.

4. **Step 4 (Test Suite Design)**:
   `src/lib/blueprintStudio.test.ts` requires 4 explicit new unit tests (`R4-15` through `R4-18`) to ensure complete regression prevention across all permutations:
   - `R4-15`: `{ startDate: '   ', endDate: '   ' }` deletes both date properties from the node.
   - `R4-16`: `{ startDate: '2026-10-15', endDate: '   ' }` sets `startDate` and deletes `endDate`.
   - `R4-17`: `{ startDate: '   ', endDate: '2026-10-15' }` deletes `startDate` and sets `endDate`.
   - `R4-18`: Verifies downstream consumers (`isValidISODate` rejecting whitespace/empty strings and `patchStudioItems` maintaining undefined dates on cleared trees).

---

## 3. Caveats

- **Read-Only Scope**: Explorer 3 performed read-only analysis and test design. Repository source and test files were not directly modified.
- **Adversarial Test Coordination**: When the Worker applies the fix, the reproduction test in `src/lib/blueprintStudio.adversarial.test.ts` (line 215) will fail because it originally asserted `toBe('')`. The Worker must update that test probe to assert `toBeUndefined()` as specified in Section 4.3 below.

---

## 4. Conclusion

The test specifications and code snippets are complete, robust, and directly actionable by Worker 1.

### Exact Implementation Code Snippets for Worker

#### 4.1 Update in `src/lib/blueprintStudio.ts` (Lines 671–672)

```ts
  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
  const newStart = !clearStart && typeof dates.startDate === 'string' ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && typeof dates.endDate === 'string' ? dates.endDate.trim() : undefined;
```

#### 4.2 Add to `src/lib/blueprintStudio.test.ts`

**Import at Line 28:**
```ts
import { patchStudioItems } from './studioWorkspace';
```

**Test Cases to Append to `describe('R4: Bulk & Individual Date Changing...')` (after line 828):**
```ts
  it('R4-15: deletes both date properties when passed whitespace-only strings', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(false);

    // Also verify single-node convenience wrapper setGoalDates
    const singleResult = setGoalDates(goals, 'n1', { startDate: '   ', endDate: '   ' });
    const singleUpdated = singleResult[0].children[0];
    expect(singleUpdated.startDate).toBeUndefined();
    expect(singleUpdated.endDate).toBeUndefined();
    expect('startDate' in singleUpdated).toBe(false);
    expect('endDate' in singleUpdated).toBe(false);

    // Verify clearing individual dates via whitespace preserves the opposing date
    const startOnlyCleared = setGoalDatesBulk(goals, ['n1'], { startDate: '   ' });
    expect(startOnlyCleared.goals[0].children[0].startDate).toBeUndefined();
    expect('startDate' in startOnlyCleared.goals[0].children[0]).toBe(false);
    expect(startOnlyCleared.goals[0].children[0].endDate).toBe('2026-01-31');

    const endOnlyCleared = setGoalDatesBulk(goals, ['n1'], { endDate: '   ' });
    expect(endOnlyCleared.goals[0].children[0].startDate).toBe('2026-01-01');
    expect(endOnlyCleared.goals[0].children[0].endDate).toBeUndefined();
    expect('endDate' in endOnlyCleared.goals[0].children[0]).toBe(false);
  });

  it('R4-16: sets startDate and deletes endDate when endDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBe('2026-10-15');
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(true);
    expect('endDate' in updated).toBe(false);
    expect(isValidISODate(updated.startDate)).toBe(true);
  });

  it('R4-17: deletes startDate and sets endDate when startDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '2026-10-15' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBe('2026-10-15');
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(true);
    expect(isValidISODate(updated.endDate)).toBe(true);
  });

  it('R4-18: verifies downstream consumers (isValidISODate & patchStudioItems) handle whitespace and cleared dates cleanly', () => {
    // 1. isValidISODate rejection of whitespace
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(' ')).toBe(false);
    expect(isValidISODate('   ')).toBe(false);
    expect(isValidISODate(' \t\n ')).toBe(false);
    expect(isValidISODate('  2026-10-15  ')).toBe(true);

    // 2. Nodes with deleted dates flowing into patchStudioItems
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const clearedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
    const clearedNode = clearedResult.goals[0].children[0];
    expect(clearedNode.startDate).toBeUndefined();
    expect(clearedNode.endDate).toBeUndefined();

    // patchStudioItems on the cleared tree preserves undefined dates
    const patchedTree = patchStudioItems(clearedResult.goals, { n1: { title: 'Updated Title' } });
    const patchedNode = patchedTree[0].children[0];
    expect(patchedNode.title).toBe('Updated Title');
    expect(patchedNode.startDate).toBeUndefined();
    expect(patchedNode.endDate).toBeUndefined();
    expect('startDate' in patchedNode).toBe(false);
    expect('endDate' in patchedNode).toBe(false);

    // 3. patchStudioItems directly receives whitespace date in patch - sanitizes via isValidISODate
    const nodeWithDates = [node('n2', 'node', 'Item 2')];
    nodeWithDates[0].startDate = '2026-05-01';
    const sanitizedPatch = patchStudioItems(nodeWithDates, { n2: { startDate: '   ' } });
    // Because isValidISODate('   ') is false, patchStudioItems retains the original startDate
    expect(sanitizedPatch[0].startDate).toBe('2026-05-01');
  });
```

#### 4.3 Update in `src/lib/blueprintStudio.adversarial.test.ts` (Line 215)
Replace the reproduction probe with the resolved assertion:
```ts
    it('EMPIRICAL BUG RESOLVED: whitespace string "   " clears date properties instead of setting ""', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      expect(resWhitespace.goals[0].children[0].startDate).toBeUndefined();
      expect(resWhitespace.goals[0].children[0].endDate).toBeUndefined();
      expect('startDate' in resWhitespace.goals[0].children[0]).toBe(false);
      expect('endDate' in resWhitespace.goals[0].children[0]).toBe(false);
    });
```

---

## 5. Verification Method

To verify the test design and fix:

1. **Apply the 2-line fix** in `src/lib/blueprintStudio.ts` lines 671–672.
2. **Apply the unit tests** in `src/lib/blueprintStudio.test.ts`.
3. **Update probe** in `src/lib/blueprintStudio.adversarial.test.ts` line 215.
4. **Run the unit tests**:
   ```bash
   npx vitest run src/lib/blueprintStudio.test.ts
   ```
   *Expected*: All 73 tests pass (69 existing + 4 new).
5. **Run the adversarial tests**:
   ```bash
   npx vitest run src/lib/blueprintStudio.adversarial.test.ts
   ```
   *Expected*: All 28 tests pass.
6. **Run full repository suite**:
   ```bash
   npm test
   ```
   *Expected*: All 46 test suites pass cleanly.
