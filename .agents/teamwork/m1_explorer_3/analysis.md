# M1 Test Design & Verification Specification

**Specialist**: M1 Explorer 3 (Test Design & Verification Specialist)  
**Milestone**: Milestone 1: Core Domain & Algorithm Layer  
**Date**: 2026-10-08  
**Scope**: Unit test architecture, test case matrices, executable test specifications, and verification commands for R1, R2, R3, and R4 domain algorithms.

---

## 1. Executive Summary

Milestone 1 establishes the pure domain algorithms that govern Blueprint Studio's tree transformations:
1. **R1: Flexible Node Expansion & Conversion** (`convertNodeToTask`, `convertNodeToBranch`)
2. **R2: Bulk "Add Inside"** (`addBlueprintChildrenBulk` / enhanced `addBlueprintChildren`)
3. **R3: Bulk Step Diffing** (`diffBlueprintSteps` with Set-Union and Set-Difference)
4. **R4: Bulk & Individual Date Editing** (`setGoalDatesBulk` with ISO validation)

The existing test suite in `src/lib/blueprintStudio.test.ts` (18 tests) and `src/lib/studioWorkspace.test.ts` (20 tests) provides solid coverage for legacy tree operations, but lacks coverage for the new M1 requirements. Crucially, existing test line 59 in `src/lib/blueprintStudio.test.ts` asserts that nodes with checklist steps are *blocked* from becoming branches, which directly contradicts the new user requirement (R1/R2) to gracefully permit adding children inside nodes that have steps.

This document delivers:
- Forensic analysis of existing tests and regression risks.
- Exact interface specifications for all new/enhanced M1 functions.
- 4 comprehensive unit test matrices (44 distinct test scenarios across R1–R4).
- Executable, drop-in Vitest code blocks for implementers.
- Exact CLI verification commands with performance targets.

---

## 2. Investigation of Existing Test Suite & Infrastructure

### 2.1 Existing Test Suite Inventory

| File | Existing Tests | Key Areas Covered | Execution Time |
|---|---|---|---|
| `src/lib/blueprintStudio.test.ts` | 18 tests | Title normalization, numbered sequences, legacy child addition, depth limits, step addition/removal, branch renaming/updates, review state, task reconciliation | ~41 ms |
| `src/lib/studioWorkspace.test.ts` | 20 tests | Workspace item patching, move/copy operations, cycle detection, duplication, reordering, step index editing, change details | ~24 ms |
| **Total** | **38 tests** | | **~65 ms** (overall runner: 571 ms) |

### 2.2 Test Patterns & Conventions Observed

1. **Test Fixture Construction**:
   ```ts
   // blueprintStudio.test.ts convention
   function node(id: string, kind: GoalNode['kind'], title: string, children: GoalNode[] = []): GoalNode {
     return { id, kind, title, children, createdAt: 1, completed: false };
   }

   // studioWorkspace.test.ts convention
   const item = (id: string, children: GoalNode[] = [], patch: Partial<GoalNode> = {}): GoalNode => ({
     id, title: id, kind: 'node', children, createdAt: 1, completed: false, ...patch,
   });
   ```

2. **Assertion Patterns**:
   - Immutability checks: `expect(goals[0].children[0].children).toHaveLength(0)` to verify the original input was not mutated.
   - Id uniqueness checks: `expect(new Set(result.createdIds).size).toBe(N)`.
   - Structural snapshot checks: `expect(result.goals[0]).toMatchObject({ ... })`.

3. **Critical Conflict / Regression Risk Identified**:
   In `src/lib/blueprintStudio.test.ts` lines 59–72:
   ```ts
   it('protects scheduled, completed, or checklist tasks from silently becoming a branch', () => {
     const untouched = node('open', 'node', 'Can grow');
     const checklist = { ...node('steps', 'leaf', 'Checklist'), steps: ['Read'], stepDone: [false] };
     const completed = { ...node('done', 'task', 'Finished'), completed: true };
     const scheduled = { ...node('planned', 'section', 'Planned'), todayTaskId: 'task-1' };
     const goals = [node('g', 'goal', 'Exam', [untouched, checklist, completed, scheduled])];

     const result = addBlueprintChildren(goals, ['open', 'steps', 'done', 'planned'], 'node', ['Child']);

     expect(result.added).toBe(1);
     expect(result.blocked).toBe(3);
   });
   ```
   **Conflict Analysis**:
   - Line 77 of `src/lib/blueprintStudio.ts` currently executes:
     `if (parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)) { blocked += 1; continue; }`
   - Under R1 and R2, users explicitly need to add children inside any selected nodes (or convert a node with steps to a branch).
   - **Resolution for M1 Implementer**:
     Either:
     1. Introduce `addBlueprintChildrenBulk` which does NOT block nodes with steps, but instead converts them or clears their steps gracefully (or creates child items and clears parent steps).
     2. If `addBlueprintChildren` is updated directly, modify the legacy test or differentiate between explicit conversion / bulk addition vs legacy protection.

---

## 3. Domain Function Specifications for M1

### 3.1 R1: Flexible Node Expansion & Conversion
```ts
/** Converts an empty node or node with steps into a branch container. Clears endpoint execution state. */
export function convertNodeToBranch(
  goals: GoalNode[],
  nodeId: string,
  initialChildTitles?: string[],
): GoalNode[];

/** Converts an empty node into a task endpoint with optional checklist steps. */
export function convertNodeToTask(
  goals: GoalNode[],
  nodeId: string,
  initialSteps?: string[],
): GoalNode[];
```

### 3.2 R2: Bulk "Add Inside"
```ts
export interface AddBlueprintChildrenBulkResult {
  goals: GoalNode[];
  count: number;
  createdIds: string[];
}

/** Adds child nodes under all matching parent nodes. Skips sibling duplicates per parent. Generates fresh UIDs. */
export function addBlueprintChildrenBulk(
  goals: GoalNode[],
  parentIds: string[],
  titles: string[],
  kind?: GoalKind,
): AddBlueprintChildrenBulkResult;
```

### 3.3 R3: Bulk Step Diffing
```ts
export interface DiffBlueprintStepsResult {
  goals: GoalNode[];
  affectedCount: number;
  addedCount: number;
  removedCount: number;
  protectedCount: number;
}

/** Applies Set-Union additions and Set-Difference removals to target nodes. Protects completed steps. */
export function diffBlueprintSteps(
  goals: GoalNode[],
  targetNodeIds: string[],
  stepsToAdd: string[],
  stepsToRemove: string[],
): DiffBlueprintStepsResult;
```

### 3.4 R4: Bulk & Individual Date Editing
```ts
export interface SetGoalDatesBulkResult {
  goals: GoalNode[];
  count: number;
}

export interface GoalDateUpdate {
  startDate?: string | null;
  endDate?: string | null;
}

/** Sets or clears startDate and/or endDate across target nodes with ISO validation and order constraint. */
export function setGoalDatesBulk(
  goals: GoalNode[],
  targetNodeIds: string[],
  dates: GoalDateUpdate,
): SetGoalDatesBulkResult;
```

---

## 4. Test Suite Design: R1 Flexible Node Expansion

### 4.1 Test Case Matrix (R1)

| Case ID | Function | Scenario | Input State | Expected Outcome |
|---|---|---|---|---|
| **R1-01** | `convertNodeToTask` | Expand empty node to task with no steps | Node with `children: []`, `steps: undefined` | Node has `steps: []`, `stepDone: []`, `completed: false` |
| **R1-02** | `convertNodeToTask` | Expand empty node to task with initial steps | Node with `children: []`, steps: `['Step A', 'Step B']` | Node has `steps: ['Step A', 'Step B']`, `stepDone: [false, false]`, `completed: false` |
| **R1-03** | `convertNodeToTask` | Normalization of step titles | Steps: `['  Step 1  ', '', 'step 1', 'Step 2  ']` | Steps: `['Step 1', 'Step 2']`, zero duplicates, whitespace trimmed |
| **R1-04** | `convertNodeToTask` | Converting node that already has steps | Task with `steps: ['Old']`, passed `['New']` | Replaces or appends steps cleanly without index misalignment |
| **R1-05** | `convertNodeToTask` | Branch with children protection | Branch with `children.length > 0` | Safely ignored or unchanged (branch cannot become task while having children) |
| **R1-06** | `convertNodeToTask` | Non-existent target node ID | Unknown ID `'missing-id'` | Returns tree unchanged without throwing error |
| **R1-07** | `convertNodeToTask` | Immutability verification | Original `GoalNode[]` | Original tree is structurally identical; new reference returned |
| **R1-08** | `convertNodeToBranch` | Expand empty node to branch with child titles | Empty node, titles: `['Child 1', 'Child 2']` | Node has 2 children with titles `'Child 1'`, `'Child 2'`, fresh UIDs; parent `steps` cleared |
| **R1-09** | `convertNodeToBranch` | Convert node with steps to branch | Node with `steps: ['Do work']`, `stepDone: [false]` | Node becomes branch: `steps: undefined` or `[]`, `stepDone: undefined` or `[]`, `todayTaskId: null` |
| **R1-10** | `convertNodeToBranch` | Convert node with completed steps to branch | Node with `steps: ['Done']`, `stepDone: [true]` | Node converted without hard crash; parent execution state cleared safely |
| **R1-11** | `convertNodeToBranch` | Convert node that already has children | Branch with existing child `'Child 1'`, passed `['Child 2']` | Appends `'Child 2'` to children list; existing children preserved |
| **R1-12** | `convertNodeToBranch` | Sibling deduplication in initial titles | Titles: `['Alpha', 'alpha', '  ALPHA  ']` | Only 1 child `'Alpha'` added |

### 4.2 Executable Vitest Specifications (R1)

```ts
describe('R1: Flexible Node Expansion & Conversion', () => {
  it('R1-01: converts an empty node to a task with an empty checklist', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1');
    const target = updated[0].children[0];

    expect(target.steps).toEqual([]);
    expect(target.stepDone).toEqual([]);
    expect(target.completed).toBe(false);
  });

  it('R1-02: converts an empty node to a task with initial checklist steps', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1', ['Read document', 'Submit PR']);
    const target = updated[0].children[0];

    expect(target.steps).toEqual(['Read document', 'Submit PR']);
    expect(target.stepDone).toEqual([false, false]);
    expect(target.completed).toBe(false);
  });

  it('R1-03: normalizes and deduplicates initial checklist steps', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1', ['  Read doc  ', '', 'read doc', 'Submit PR  ']);
    const target = updated[0].children[0];

    expect(target.steps).toEqual(['Read doc', 'Submit PR']);
    expect(target.stepDone).toEqual([false, false]);
  });

  it('R1-05: protects branches with children from invalid task conversion', () => {
    const goals = [node('g', 'goal', 'Goal', [node('branch-1', 'node', 'Branch', [node('child-1', 'node', 'Child')])])];
    const updated = convertNodeToTask(goals, 'branch-1', ['Invalid step']);

    expect(updated[0].children[0].children).toHaveLength(1);
    expect(updated[0].children[0].steps).toBeUndefined();
  });

  it('R1-08: expands an empty node into a branch with child nodes', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Section A', 'Section B']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(2);
    expect(target.children.map((c) => c.title)).toEqual(['Section A', 'Section B']);
    expect(target.children[0].id).not.toBe(target.children[1].id);
    expect(target.steps).toBeUndefined();
  });

  it('R1-09: converts a node with steps into a branch and clears checklist state', () => {
    const nodeWithSteps: GoalNode = {
      ...node('item-1', 'node', 'Task with steps'),
      steps: ['Step 1', 'Step 2'],
      stepDone: [true, false],
      todayTaskId: 'task-123',
    };
    const goals = [node('g', 'goal', 'Goal', [nodeWithSteps])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Subtask A']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(1);
    expect(target.children[0].title).toBe('Subtask A');
    expect(target.steps).toBeUndefined();
    expect(target.stepDone).toBeUndefined();
    expect(target.todayTaskId).toBeNull();
  });

  it('R1-12: deduplicates initial child titles case-insensitively', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Phase 1', 'phase 1', '  Phase 1  ']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(1);
    expect(target.children[0].title).toBe('Phase 1');
  });
});
```

---

## 5. Test Suite Design: R2 Bulk "Add Inside"

### 5.1 Test Case Matrix (R2)

| Case ID | Scenario | Parent States | Input Titles | Expected Outcome |
|---|---|---|---|---|
| **R2-01** | Single parent bulk add | 1 empty parent | `['Item A', 'Item B']` | 2 children added, `count === 2`, parent has both children |
| **R2-02** | Multi-parent bulk add | 2 empty parents `['p1', 'p2']` | `['Child 1', 'Child 2']` | 4 children total, 2 under `p1`, 2 under `p2`, `count === 4` |
| **R2-03** | UID uniqueness across all generated children | 3 parents | `['Child 1', 'Child 2']` | 6 generated children all have distinct `id`s (`new Set(ids).size === 6`) |
| **R2-04** | Per-parent sibling deduplication | `p1` has `['Alpha']`, `p2` has `[]` | `['Alpha', 'Beta']` | `p1` gets only `'Beta'`; `p2` gets `'Alpha'` and `'Beta'`. `count === 3` |
| **R2-05** | Case-insensitive and whitespace deduplication | `p1` has `['  Module 1 ']` | `['module 1', 'Module 2']` | `p1` skips `'module 1'`, adds `'Module 2'` |
| **R2-06** | Multiple parents with different existing children | `p1` has `['A', 'B']`, `p2` has `['B', 'C']` | `['A', 'B', 'C', 'D']` | `p1` gets `['C', 'D']`; `p2` gets `['A', 'D']`. `count === 4` |
| **R2-07** | Parents with existing checklist steps | `p1` has `steps: ['Step 1']` | `['Subtask 1']` | Parent receives `'Subtask 1'` as child without blocking! Steps cleared or handled safely |
| **R2-08** | Duplicate parent IDs in argument | `parentIds: ['p1', 'p1', 'p1']` | `['Child']` | Deduplicates `parentIds`; adds only 1 child under `p1` |
| **R2-09** | Empty parent IDs | `parentIds: []` | `['Child']` | Returns `count === 0`, tree unmodified |
| **R2-10** | Empty or blank title inputs | 2 parents | `['   ', '']` | Returns `count === 0`, tree unmodified |
| **R2-11** | Multi-line and numbered list inputs | 1 parent | `['1. Step One', '2. Step Two']` | Titles cleaned or added properly as separate nodes |
| **R2-12** | Deep nesting / mixed parent hierarchy | Root and Level 2 child both selected | `['New Item']` | Children added at respective depths; no circular reference or corruption |

### 5.2 Executable Vitest Specifications (R2)

```ts
describe('R2: Bulk "Add Inside" (addBlueprintChildrenBulk)', () => {
  it('R2-02: adds children simultaneously to multiple parents', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'Parent 1'), node('p2', 'node', 'Parent 2')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['Task A', 'Task B']);

    expect(result.count).toBe(4);
    expect(result.createdIds).toHaveLength(4);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Task A', 'Task B']);
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['Task A', 'Task B']);
  });

  it('R2-03: generates unique UIDs across all generated children and parents', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1'), node('p2', 'node', 'P2'), node('p3', 'node', 'P3')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2', 'p3'], ['Sub 1', 'Sub 2']);

    expect(result.createdIds).toHaveLength(6);
    expect(new Set(result.createdIds).size).toBe(6);
  });

  it('R2-04: deduplicates child titles per parent independently', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'P1', [node('c1', 'node', 'Alpha')]),
      node('p2', 'node', 'P2', []),
    ])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['Alpha', 'Beta']);

    expect(result.count).toBe(3);
    // P1 only received Beta
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Alpha', 'Beta']);
    // P2 received both Alpha and Beta
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['Alpha', 'Beta']);
  });

  it('R2-06: handles parents with different existing children subsets', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'P1', [node('c1', 'node', 'A'), node('c2', 'node', 'B')]),
      node('p2', 'node', 'P2', [node('c3', 'node', 'B'), node('c4', 'node', 'C')]),
    ])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['A', 'B', 'C', 'D']);

    expect(result.count).toBe(4);
    // P1 had A, B -> receives C, D
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['A', 'B', 'C', 'D']);
    // P2 had B, C -> receives A, D
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('R2-07: does NOT block parents that have checklist steps', () => {
    const parentWithSteps: GoalNode = {
      ...node('p-steps', 'node', 'Parent with steps'),
      steps: ['Existing step'],
      stepDone: [false],
    };
    const goals = [node('g', 'goal', 'Goal', [parentWithSteps])];
    const result = addBlueprintChildrenBulk(goals, ['p-steps'], ['Child Item']);

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].children).toHaveLength(1);
    expect(result.goals[0].children[0].children[0].title).toBe('Child Item');
  });

  it('R2-08: deduplicates redundant parentIds in target list', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p1', 'p1'], ['Unique Item']);

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].children).toHaveLength(1);
  });
});
```

---

## 6. Test Suite Design: R3 Bulk Step Editing (Diffing)

### 6.1 Test Case Matrix (R3)

| Case ID | Scenario | Target Node Steps | `stepsToAdd` | `stepsToRemove` | Expected Outcome |
|---|---|---|---|---|---|
| **R3-01** | Set-Union add to empty nodes | `n1: []`, `n2: []` | `['Step 1', 'Step 2']` | `[]` | Both nodes get `['Step 1', 'Step 2']`, `stepDone: [false, false]`, `addedCount === 4` |
| **R3-02** | Set-Union skip existing (zero duplicates) | `n1: ['A', 'B']`, `n2: ['B', 'C']` | `['B', 'D']` | `[]` | `n1: ['A', 'B', 'D']`<br>`n2: ['B', 'C', 'D']`<br>'B' is skipped on both! |
| **R3-03** | Case-insensitive & whitespace addition matching | `n1: ['Review PR']` | `['  review   pr  ', 'Deploy']` | `[]` | Only `'Deploy'` added to `n1`; `'Review PR'` kept unchanged |
| **R3-04** | Set-Difference removal from nodes possessing steps | `n1: ['Read', 'Write']`<br>`n2: ['Read', 'Review']` | `[]` | `['Read']` | `n1: ['Write']`<br>`n2: ['Review']`<br>`removedCount === 2` |
| **R3-05** | Set-Difference silent skip for missing steps | `n1: ['Read']`<br>`n2: ['Code']` | `[]` | `['Read', 'Missing']` | `n1: []`<br>`n2: ['Code']` (silent skip, no errors thrown!) |
| **R3-06** | **Completed step protection (CRITICAL)** | `n1: ['A', 'B']`, `stepDone: [true, false]` | `[]` | `['A', 'B']` | `'A'` is completed (`stepDone === true`) -> PROTECTED!<br>`'B'` is removed.<br>`n1: ['A']`, `stepDone: [true]`, `protectedCount === 1` |
| **R3-07** | Simultaneous add and remove in one diff | `n1: ['Old', 'Keep']` | `['New']` | `['Old']` | `n1: ['Keep', 'New']`, `stepDone: [false, false]` |
| **R3-08** | Completion status reset on add | `n1: ['AllDone']`, `stepDone: [true]`, `completed: true` | `['NewStep']` | `[]` | `n1` has new undone step -> `completed: false` |
| **R3-09** | Completion status rollup on removal | `n1: ['Done', 'Undone']`, `stepDone: [true, false]`, `completed: false` | `[]` | `['Undone']` | All remaining steps are done -> `completed: true` |
| **R3-10** | Target includes branch container | `b1` is branch with children | `['Step']` | `[]` | Branch containers are skipped without corrupting children |
| **R3-11** | Empty inputs (no-op) | `n1: ['Step']` | `[]` | `[]` | `affectedCount === 0`, tree untouched |

### 6.2 Executable Vitest Specifications (R3)

```ts
describe('R3: Bulk Step Diffing (diffBlueprintSteps)', () => {
  it('R3-02: applies Set-Union additions without creating duplicate steps', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Design', 'Code'], stepDone: [false, false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Code', 'Review'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    const result = diffBlueprintSteps(goals, ['n1', 'n2'], ['Code', 'Test'], []);

    expect(result.goals[0].children[0].steps).toEqual(['Design', 'Code', 'Test']);
    expect(result.goals[0].children[0].stepDone).toEqual([false, false, false]);
    expect(result.goals[0].children[1].steps).toEqual(['Code', 'Review', 'Test']);
    expect(result.goals[0].children[1].stepDone).toEqual([false, false, false]);
  });

  it('R3-04: applies Set-Difference removals to nodes possessing the step', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Read', 'Write'], stepDone: [false, false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Read', 'Review'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    const result = diffBlueprintSteps(goals, ['n1', 'n2'], [], ['Read']);

    expect(result.goals[0].children[0].steps).toEqual(['Write']);
    expect(result.goals[0].children[1].steps).toEqual(['Review']);
    expect(result.removedCount).toBe(2);
  });

  it('R3-05: silently skips nodes lacking the removed step without throwing errors', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Read'], stepDone: [false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Code'], stepDone: [false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    expect(() => {
      const result = diffBlueprintSteps(goals, ['n1', 'n2'], [], ['Read', 'NonExistent']);
      expect(result.goals[0].children[0].steps).toEqual([]);
      expect(result.goals[0].children[1].steps).toEqual(['Code']);
    }).not.toThrow();
  });

  it('R3-06: PROTECTS completed steps from bulk deletion', () => {
    const n1 = {
      ...node('n1', 'node', 'Task 1'),
      steps: ['Draft', 'Revise', 'Publish'],
      stepDone: [true, false, false], // 'Draft' is completed!
    };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], [], ['Draft', 'Revise']);

    // 'Draft' must NOT be removed because stepDone[0] is true!
    expect(result.goals[0].children[0].steps).toEqual(['Draft', 'Publish']);
    expect(result.goals[0].children[0].stepDone).toEqual([true, false]);
    expect(result.protectedCount).toBe(1);
    expect(result.removedCount).toBe(1);
  });

  it('R3-07: applies simultaneous step additions and removals in a single pass', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Old step', 'Keep step'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], ['New step'], ['Old step']);

    expect(result.goals[0].children[0].steps).toEqual(['Keep step', 'New step']);
    expect(result.goals[0].children[0].stepDone).toEqual([false, false]);
  });

  it('R3-08: marks completed node as uncompleted when an unfinished step is added', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Done step'], stepDone: [true], completed: true };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], ['Next step'], []);

    expect(result.goals[0].children[0].completed).toBe(false);
    expect(result.goals[0].children[0].stepDone).toEqual([true, false]);
  });
});
```

---

## 7. Test Suite Design: R4 Bulk & Individual Date Changing

### 7.1 Test Case Matrix (R4)

| Case ID | Scenario | Target Node(s) Existing Dates | Update Payload | Expected Outcome |
|---|---|---|---|---|
| **R4-01** | Single node date setting | `n1: {}` | `{ startDate: '2026-10-10', endDate: '2026-10-20' }` | `n1.startDate === '2026-10-10'`, `n1.endDate === '2026-10-20'`, `count === 1` |
| **R4-02** | Multi-node bulk date setting | `n1: {}`, `n2: {}`, `n3: {}` | `{ startDate: '2026-11-01', endDate: '2026-11-15' }` | All 3 nodes updated, `count === 3` |
| **R4-03** | Partial update: startDate only | `n1: { endDate: '2026-12-31' }` | `{ startDate: '2026-11-01' }` | `startDate: '2026-11-01'`, `endDate: '2026-12-31'` preserved |
| **R4-04** | Partial update: endDate only | `n1: { startDate: '2026-05-01' }` | `{ endDate: '2026-05-15' }` | `startDate: '2026-05-01'` preserved, `endDate: '2026-05-15'` |
| **R4-05** | Clearing both dates | `n1: { startDate: '2026-01-01', endDate: '2026-01-31' }` | `{ startDate: null, endDate: null }` | `n1.startDate` and `n1.endDate` cleared / undefined |
| **R4-06** | Clearing only startDate | `n1: { startDate: '2026-01-01', endDate: '2026-01-31' }` | `{ startDate: null }` | `n1.startDate === undefined`, `n1.endDate === '2026-01-31'` |
| **R4-07** | ISO format validation failure | `n1: {}` | `{ startDate: '10/20/2026' }` | Invalid format rejected; node dates remain unchanged |
| **R4-08** | Calendar date validity failure | `n1: {}` | `{ startDate: '2026-02-31' }` | Invalid date (Feb 31) rejected |
| **R4-09** | Date range violation (`startDate > endDate`) | `n1: {}` | `{ startDate: '2026-10-25', endDate: '2026-10-10' }` | Range violation rejected; node unchanged |
| **R4-10** | Conflict with existing dates | `n1: { endDate: '2026-10-10' }` | `{ startDate: '2026-10-25' }` | New start date after existing end date rejected |
| **R4-11** | Same-day dates (`startDate === endDate`) | `n1: {}` | `{ startDate: '2026-10-10', endDate: '2026-10-10' }` | Valid single-day span accepted |
| **R4-12** | Field preservation | `n1` has description, steps, pinned | `{ startDate: '2026-10-10' }` | Title, description, steps, pinned, children are untouched |

### 7.2 Executable Vitest Specifications (R4)

```ts
describe('R4: Bulk & Individual Date Editing (setGoalDatesBulk)', () => {
  it('R4-01: sets startDate and endDate on a single node', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-10', endDate: '2026-10-20' });

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].startDate).toBe('2026-10-10');
    expect(result.goals[0].children[0].endDate).toBe('2026-10-20');
  });

  it('R4-02: sets dates across multiple selected nodes simultaneously', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('n1', 'node', 'Item 1'),
      node('n2', 'node', 'Item 2'),
      node('n3', 'node', 'Item 3'),
    ])];
    const result = setGoalDatesBulk(goals, ['n1', 'n2', 'n3'], { startDate: '2026-11-01', endDate: '2026-11-15' });

    expect(result.count).toBe(3);
    for (const child of result.goals[0].children) {
      expect(child.startDate).toBe('2026-11-01');
      expect(child.endDate).toBe('2026-11-15');
    }
  });

  it('R4-03: updates startDate while preserving existing endDate', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), endDate: '2026-12-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-11-01' });

    expect(result.goals[0].children[0].startDate).toBe('2026-11-01');
    expect(result.goals[0].children[0].endDate).toBe('2026-12-31');
  });

  it('R4-05: clears dates when passed null or undefined', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: null, endDate: null });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBeUndefined();
  });

  it('R4-07: rejects invalid date formats that do not match YYYY-MM-DD', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '10/20/2026' });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.count).toBe(0);
  });

  it('R4-09: rejects date ranges where startDate is strictly after endDate', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-25', endDate: '2026-10-10' });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBeUndefined();
    expect(result.count).toBe(0);
  });

  it('R4-11: allows single-day spans where startDate equals endDate', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-10', endDate: '2026-10-10' });

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].startDate).toBe('2026-10-10');
    expect(result.goals[0].children[0].endDate).toBe('2026-10-10');
  });
});
```

---

## 8. Verification Command Matrix & Strategy

### 8.1 Primary Verification Commands

| Purpose | Exact CLI Command | Expected Pass Target |
|---|---|---|
| **Run All Project Tests** | `npx vitest run` | 100% passing across all test files |
| **Run Core Studio Suite** | `npx vitest run src/lib/blueprintStudio.test.ts src/lib/studioWorkspace.test.ts` | 38+ tests passing in <1000ms |
| **Run M1 E2E Suite (Milestone 2 target)** | `npx vitest run src/lib/blueprintStudioE2E.test.ts` | All tier tests passing |
| **Run Single Test by Name** | `npx vitest run src/lib/blueprintStudio.test.ts -t "Set-Union"` | Targeted test execution |
| **Watch Mode (Development)** | `npx vitest src/lib/blueprintStudio.test.ts` | Interactive hot-reloading |
| **Type Check** | `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) | Type verification |
| **Linting** | `npm run lint` | ESLint pass |

### 8.2 Execution Performance Benchmark
- Current baseline: 38 tests execute in **65 ms** (runner startup ~500 ms).
- Target benchmark for full M1 unit test suite: < 150 ms execution time.
- All domain functions are 100% pure in-memory transformations; zero async or I/O overhead.

---

## 9. Recommendations for M1 Implementer

1. **Avoid In-Place Array Mutation**:
   All tree transformations should follow the established immutable tree recursion pattern (`updateNode`, `next = next.map(...)`).
2. **Reconcile with Legacy Blocker**:
   In `src/lib/blueprintStudio.ts`, remove line 77 (`hasGoalExecutionState` blocker) when implementing `addBlueprintChildrenBulk`, or ensure `addBlueprintChildrenBulk` seamlessly transitions parent nodes without throwing or rejecting them.
3. **Step Completion Protection**:
   `diffBlueprintSteps` must check `node.stepDone[index] === true` before removing any matching step in `stepsToRemove`. If `stepDone[index]` is true, increment `protectedCount` and keep the step.
4. **Use Shared Date Validation**:
   Implement a clean `isValidISODate(str: string): boolean` helper that validates `/^\d{4}-\d{2}-\d{2}$/` and calendar validity via Date object round-trip.
