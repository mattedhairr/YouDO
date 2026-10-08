# Deep Domain & Algorithmic Analysis: Flexible Node Expansion (R1) & Bulk "Add Inside" (R2)

**Author:** M1 Explorer 1 (Domain & Data Structures Specialist)  
**Milestone:** Milestone 1 — Core Domain & Algorithm Layer  
**Target Codebases:** `src/lib/blueprintStudio.ts`, `src/lib/goalTree.ts`, `src/types.ts`  
**Date:** 2026-10-08  

---

## 1. Executive Summary

This report provides the definitive domain specification, data structure analysis, and concrete algorithmic implementations for **R1 (Flexible Node Expansion)** and **R2 (Bulk "Add Inside")** in YouDO's Blueprint Studio rebuild.

### Core Discoveries & Direct Answers to Mission Questions:
1. **The Rigid Blocker at Line 77 in `src/lib/blueprintStudio.ts`:**
   Line 77 currently blocks any parent where `parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)`. Because `hasGoalExecutionState` triggers whenever a node has even a single checklist step, any completed flag, or a scheduled daily task, users selecting such nodes to add sub-items are completely locked out (`blocked += 1; continue;`).
   - **Resolution:** Eliminate this rejection by implementing a graceful **Endpoint-to-Branch Transition Flow**. When child nodes are added inside an endpoint that currently has checklist steps, the system converts its existing steps into child `GoalNode`s (preserving per-step completion states) or discards them per configuration, clears the parent's `steps`, `stepDone`, and `todayTaskId`, and attaches both the converted steps and the newly added child nodes. This preserves all existing user progress while strictly upholding the **Strict Non-Hybrid Invariant**.

2. **Exact Implementations Produced:**
   - `addBlueprintChildrenBulk(goals, parentIds, rawTitles, options)`: High-performance multi-parent bulk child generator supporting arbitrary depth, per-parent sibling deduplication, fresh `uid('goal')` generation per child instance, and automatic endpoint transition without blocking.
   - `convertNodeToBranch(goals, nodeId, initialChildTitles, options)`: Explicit transformation of an empty leaf or task node into a Branch container, converting existing checklist steps into child nodes while resetting endpoint task pointers.
   - `convertNodeToTask(goals, nodeId, initialSteps)`: Explicit transformation of an empty leaf into an Executable Task endpoint with checklist steps, strictly guarding existing subtrees against accidental destruction.

3. **Deduplication & UID Semantics:**
   - **Sibling Deduplication:** Strictly scoped **per parent**. Two separate branches may legitimately have children with the same name (e.g. "Lecture 1"), but a single parent will never have duplicate sibling titles. Deduplication uses case-insensitive normalization (`clean.toLocaleLowerCase()`) and whitespace collapsing (`replace(/\s+/g, ' ')`).
   - **UID Generation:** `uid('goal')` is called fresh for **every single instantiated child node across every targeted parent**. Reusing UIDs across parents is strictly forbidden as it violates tree lookup invariants.

---

## 2. Architectural Context & Invariants

### 2.1 The Goal Tree Data Model (`src/types.ts`)
```ts
export interface GoalNode {
  id: string;
  kind: GoalKind;             // 'goal' (root) | 'node' (universal v7 item) | legacy
  title: string;
  description?: string;
  startDate?: string;         // ISO YYYY-MM-DD
  endDate?: string;           // ISO YYYY-MM-DD
  children: GoalNode[];       // Ordered children for unlimited hierarchy nesting
  steps?: string[];           // Checklist labels for actionable task endpoints
  stepDone?: boolean[];       // Per-step completion state (parallel to steps)
  completed?: boolean;        // True when all steps done (or stepless leaf done)
  todayTaskId?: string | null;// Linked daily task card in Today / Backlog
  pinned?: boolean;
  createdAt: number;
}
```

### 2.2 Structural Roles in YouDO (`src/lib/goalTree.ts`)
In YouDO's domain model, node roles are derived structurally from their position and children count:
```ts
export function isGoalEndpoint(node: GoalNode): boolean {
  return node.children.length === 0;
}

export function goalNodeRole(node: GoalNode): 'Goal' | 'Branch' | 'Task' {
  if (node.kind === 'goal') return 'Goal';
  return isGoalEndpoint(node) ? 'Task' : 'Branch';
}
```

### 2.3 The Strict Non-Hybrid Invariant
> **Invariant Statement:** A `GoalNode` MUST NOT simultaneously possess active child nodes (`children.length > 0`) AND active checklist steps (`steps.length > 0`).

#### Mathematical & Algorithmic Rationale:
1. **Rollup Calculation (`rollupPct` in `src/lib/goalTree.ts:53-66`):**
   ```ts
   if (node.children.length > 0) {
     pct = Math.round(node.children.reduce((total, child) => total + rollupPct(child), 0) / node.children.length);
   } else if (node.steps && node.steps.length > 0) {
     pct = Math.round(((node.stepDone ?? []).filter(Boolean).length / node.steps.length) * 100);
   } else {
     pct = node.completed ? 100 : 0;
   }
   ```
   If a node has both `children.length > 0` and `steps.length > 0`, `rollupPct` evaluates `children.length > 0` and **completely ignores `steps`**.
2. **Completion Recalculation (`recomputeCompleted` in `src/lib/goalTree.ts:68-93`):**
   ```ts
   if (children.length === 0) {
     const steps = node.steps ?? [];
     if (steps.length > 0) {
       completed = steps.every((_, i) => Boolean(stepDone[i]));
     }
   } else {
     completed = children.length > 0 && children.every((c) => c.completed);
   }
   ```
   If a node has children, completion depends exclusively on `children.every(c => c.completed)`. Any checklist steps attached to the node become dead, invisible state.
3. **Daily Task Scheduling:**
   Only endpoint tasks (`children.length === 0`) can be pushed to the Today daily card view. Branches cannot be executed as single cards.

---

## 3. The Rigid Blocker Analysis & Elimination Strategy

### 3.1 The Existing Blocker in `addBlueprintChildren`
In `src/lib/blueprintStudio.ts` (lines 74–80):
```ts
  for (const parentId of [...new Set(parentIds)]) {
    const parent = findGoal(next, parentId);
    if (!parent) continue;
    if (parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)) {
      blocked += 1;
      continue;
    }
    // ...
  }
```
And in `src/lib/goalTree.ts` (lines 23–30):
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

### 3.2 Why This Blocker Fails User Expectations
1. **Real-world expansion:** A user initially creates an item "Chapter 1" with 3 checklist steps ("Read intro", "Do exercises", "Take quiz"). As their syllabus grows, they realize "Chapter 1" needs to be broken down into sub-sections. Under the old code, clicking "Add Inside" or selecting "Chapter 1" in bulk operations failed with a cryptic error: `1 selected task already contains steps or recorded work. Add checklist steps instead.` The user was forced to manually delete all their checklist steps before being allowed to add children!
2. **Multi-parent selection failure:** If a user selects 5 chapters to add "Review Lecture" inside all of them, and Chapter 3 happened to have 1 step, Chapter 3 was silently skipped while the other 4 received the child, creating an inconsistent and confusing experience.

### 3.3 How to Eliminate the Blocker Gracefully
Instead of skipping (`blocked += 1; continue;`), we handle the state transition automatically:

| Current Parent State | Action on Adding Children | Transition Effect |
|---|---|---|
| **Empty Leaf** (`children: []`, `steps: []`) | Add child nodes | Becomes Branch (`children: [...newChildren]`). |
| **Task with Steps** (`steps: ['A', 'B']`) | Add child nodes with `convertExistingSteps: true` (default) | Converts `'A'` and `'B'` into child `GoalNode`s, preserving `completed` status from `stepDone`. Clears parent `steps` and `stepDone`. Appends new children. Parent becomes Branch. |
| **Task with Steps** (`steps: ['A', 'B']`) | Add child nodes with `convertExistingSteps: false` | Clears parent `steps` and `stepDone`. Appends new children. Parent becomes Branch. |
| **Task with `todayTaskId`** | Add child nodes | Clears parent `todayTaskId: null` (since branches cannot be daily card tasks). Daily task reconciliation retains past historical cards. |
| **Branch** (`children.length > 0`) | Add child nodes | Appends new children to existing `children` (with sibling deduplication). |
| **Root Goal** (`kind: 'goal'`) | Add child nodes | Appends new children to root `children` (with sibling deduplication). |

---

## 4. Requirement 1 (R1): Flexible Node Expansion

### 4.1 Transition Flow Matrix
```
                       [ Unexpanded Node / Empty Leaf ]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        [ Turn into Task ]                      [ Turn into Branch ]
        (convertNodeToTask)                    (convertNodeToBranch)
                 │                                       │
        • steps: string[]                       • children: GoalNode[]
        • stepDone: boolean[]                   • steps: [] (cleared)
        • children: []                          • stepDone: [] (cleared)
        • Actionable endpoint                   •todayTaskId: null
                                                • Intermediate container
```

When an existing node **already has steps**:
- If the user selects **"Turn into Branch / Add Sub-items"**:
  1. The UI prompts: *"Convert existing checklist steps into sub-items?"*
  2. If Yes: `convertNodeToBranch(goals, nodeId, newChildTitles, { convertExistingSteps: true })`
  3. If Discard: `convertNodeToBranch(goals, nodeId, newChildTitles, { convertExistingSteps: false })`
  4. If Cancel: Abort.

### 4.2 Exact Implementation: `convertNodeToBranch`

```ts
export interface ConvertToBranchOptions {
  /**
   * If true (default), converts existing checklist steps into child GoalNodes,
   * preserving per-step completion states.
   * If false, clears steps without converting.
   */
  convertExistingSteps?: boolean;
}

/**
 * Flexible Node Expansion (R1): Converts an empty leaf or task node into a Branch container.
 * - Converts existing checklist steps into child nodes (preserving completion state).
 * - Appends any optional initialChildTitles as additional child nodes (deduplicated).
 * - Clears steps, stepDone, and todayTaskId on the converted node.
 * - Strictly maintains the Strict Non-Hybrid Invariant.
 */
export function convertNodeToBranch(
  goals: GoalNode[],
  nodeId: string,
  initialChildTitles: string[] = [],
  options: ConvertToBranchOptions = {},
): GoalNode[] {
  const target = findGoal(goals, nodeId);
  if (!target) return goals;

  const { convertExistingSteps = true } = options;
  const titles = normalizeBlueprintTitles(initialChildTitles);

  let convertedStepNodes: GoalNode[] = [];
  if (convertExistingSteps && target.steps && target.steps.length > 0) {
    const parentSteps = target.steps;
    const parentStepDone = target.stepDone ?? [];
    convertedStepNodes = parentSteps.map((step, idx) => ({
      id: uid('goal'),
      kind: 'node' as const,
      title: step.trim(),
      children: [],
      steps: [],
      stepDone: [],
      completed: Boolean(parentStepDone[idx]),
      createdAt: Date.now(),
    }));
  }

  // Deduplicate initial titles against both existing children and converted steps
  const existingTitles = new Set([
    ...target.children.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
    ...convertedStepNodes.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
  ]);

  const newChildNodes = titles
    .filter((title) => !existingTitles.has(title.toLocaleLowerCase()))
    .map((title) => makeBlueprintNode('node', title));

  return goals.map((root) =>
    updateNode(root, nodeId, (node) => ({
      ...node,
      kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
      children: [...node.children, ...convertedStepNodes, ...newChildNodes],
      steps: [],
      stepDone: [],
      todayTaskId: null,
      completed: false, // Rollup completion recomputed later
    })),
  );
}
```

### 4.3 Exact Implementation: `convertNodeToTask`

```ts
/**
 * Flexible Node Expansion (R1): Converts an empty leaf into an Executable Task endpoint.
 * - Sets the node's checklist steps to initialSteps (normalized & deduplicated).
 * - Initializes stepDone to a parallel false array.
 * - Refuses conversion if the node currently has children (to protect subtrees).
 * - Refuses conversion if the node is a root Goal ('goal').
 */
export function convertNodeToTask(
  goals: GoalNode[],
  nodeId: string,
  initialSteps: string[] = [],
): GoalNode[] {
  const target = findGoal(goals, nodeId);
  if (!target) return goals;

  // Safety checks: Root goals and branches with active children cannot be converted to tasks
  if (target.kind === 'goal' || target.children.length > 0) {
    return goals;
  }

  const steps = normalizeBlueprintTitles(initialSteps);

  return goals.map((root) =>
    updateNode(root, nodeId, (node) => ({
      ...node,
      kind: 'node' as const,
      steps,
      stepDone: steps.map(() => false),
      completed: false,
    })),
  );
}
```

---

## 5. Requirement 2 (R2): Bulk "Add Inside"

### 5.1 Multi-Parent Target Resolution
In Blueprint Studio, the user can select multiple nodes simultaneously (e.g. `parentIds = ['node-1', 'node-2', 'node-3']`).
Every selected node is treated as a target container.
- If Parent A and Parent B are selected, both receive the new children.
- If Parent A contains child B, and both A and B are selected, both A and B receive the new children inside them. Each child node receives a distinct, unique UID.

### 5.2 Input Normalization & Title Cleansing
```ts
export function normalizeBlueprintTitles(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, ' ');
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
```
Properties:
1. `trim()` eliminates leading/trailing tabs, spaces, and linebreaks.
2. `replace(/\s+/g, ' ')` collapses multi-space runs into a single clean space.
3. Empty strings and whitespace-only lines are discarded.
4. Input duplicates are filtered case-insensitively while preserving the original casing of the first appearance.

### 5.3 Numbered Sequence Parsing
The existing utility `numberedBlueprintTitles` handles generation of numbered sequences:
```ts
export function numberedBlueprintTitles(prefix: string, start: number, count: number): string[] {
  const cleanPrefix = prefix.trim().replace(/\s+/g, ' ') || 'Item';
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 1;
  const safeCount = Math.max(1, Math.min(100, Math.floor(count) || 1));
  return Array.from({ length: safeCount }, (_, index) => `${cleanPrefix} ${safeStart + index}`);
}
```

### 5.4 Exact Implementation: `addBlueprintChildrenBulk`

```ts
export interface AddBlueprintChildrenBulkOptions {
  /**
   * If true (default), converts existing checklist steps on endpoint parent nodes
   * into child nodes so work is preserved. If false, clears steps without converting.
   */
  convertExistingSteps?: boolean;
  /**
   * GoalKind for newly created child nodes. Defaults to 'node'.
   */
  kind?: GoalKind;
}

export interface AddBlueprintChildrenBulkResult {
  goals: GoalNode[];
  count: number;
  createdIds: string[];
}

/**
 * Bulk "Add Inside" operation (R2).
 * Adds each title as a child node under all matching parent nodes simultaneously.
 * - Sibling titles are deduplicated per parent (case-insensitive, whitespace-normalized).
 * - Fresh, unique UIDs are generated for every child node instance.
 * - Does not block parents with steps: gracefully converts existing steps into sub-items
 *   (or clears them if configured), maintaining the Strict Non-Hybrid Invariant.
 */
export function addBlueprintChildrenBulk(
  goals: GoalNode[],
  parentIds: string[],
  rawTitles: string[],
  options: AddBlueprintChildrenBulkOptions = {},
): AddBlueprintChildrenBulkResult {
  const titles = normalizeBlueprintTitles(rawTitles);
  if (titles.length === 0 || parentIds.length === 0) {
    return { goals, count: 0, createdIds: [] };
  }

  const { convertExistingSteps = true, kind = 'node' } = options;
  const uniqueParentIds = [...new Set(parentIds)];
  let next = goals;
  const createdIds: string[] = [];
  let totalAdded = 0;

  for (const parentId of uniqueParentIds) {
    const parent = findGoal(next, parentId);
    if (!parent) continue;

    // Transition: Handle endpoint parents that currently have steps
    let convertedStepNodes: GoalNode[] = [];
    const hadSteps = (parent.steps?.length ?? 0) > 0;
    if (isGoalEndpoint(parent) && hadSteps && convertExistingSteps) {
      const parentSteps = parent.steps ?? [];
      const parentStepDone = parent.stepDone ?? [];
      convertedStepNodes = parentSteps.map((stepTitle, idx) => ({
        id: uid('goal'),
        kind: 'node' as const,
        title: stepTitle.trim(),
        children: [],
        steps: [],
        stepDone: [],
        completed: Boolean(parentStepDone[idx]),
        createdAt: Date.now(),
      }));
      createdIds.push(...convertedStepNodes.map((n) => n.id));
    }

    // Per-parent sibling deduplication:
    // Existing children + any newly converted step children
    const existingTitles = new Set([
      ...parent.children.map((child) => child.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
      ...convertedStepNodes.map((child) => child.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
    ]);

    // Filter incoming titles to skip existing sibling titles
    const nodesToAdd = titles
      .filter((title) => !existingTitles.has(title.toLocaleLowerCase()))
      .map((title) => makeBlueprintNode(kind, title));

    if (nodesToAdd.length === 0 && convertedStepNodes.length === 0) continue;

    createdIds.push(...nodesToAdd.map((node) => node.id));
    totalAdded += nodesToAdd.length;

    next = next.map((root) =>
      updateNode(root, parentId, (node) => {
        const isTransitioningEndpoint = isGoalEndpoint(node) && hadSteps;
        return {
          ...node,
          kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
          children: [...node.children, ...convertedStepNodes, ...nodesToAdd],
          steps: isTransitioningEndpoint ? [] : node.steps,
          stepDone: isTransitioningEndpoint ? [] : node.stepDone,
          todayTaskId: isTransitioningEndpoint ? null : node.todayTaskId,
          completed: false,
        };
      }),
    );
  }

  return { goals: next, count: totalAdded, createdIds };
}
```

### 5.5 Updating the Legacy `addBlueprintChildren`
To provide backward compatibility while eliminating the rigid blocker:
```ts
export interface AddChildrenResult {
  goals: GoalNode[];
  createdIds: string[];
  added: number;
  blocked: number;
}

export function addBlueprintChildren(
  goals: GoalNode[],
  parentIds: string[],
  kind: GoalKind,
  rawTitles: string[],
  options?: { disallowExecutionState?: boolean; convertExistingSteps?: boolean },
): AddChildrenResult {
  // If legacy disallowExecutionState is explicitly passed as true, retain old blocking behavior
  if (options?.disallowExecutionState) {
    const titles = normalizeBlueprintTitles(rawTitles);
    if (titles.length === 0 || parentIds.length === 0) return { goals, createdIds: [], added: 0, blocked: 0 };

    let next = goals;
    const createdIds: string[] = [];
    let added = 0;
    let blocked = 0;

    for (const parentId of [...new Set(parentIds)]) {
      const parent = findGoal(next, parentId);
      if (!parent) continue;
      if (parent.kind !== 'goal' && isGoalEndpoint(parent) && hasGoalExecutionState(parent)) {
        blocked += 1;
        continue;
      }
      const existing = new Set(parent.children.map((child) => child.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
      const nodes = titles
        .filter((title) => !existing.has(title.toLocaleLowerCase()))
        .map((title) => makeBlueprintNode(kind, title));
      if (nodes.length === 0) continue;
      createdIds.push(...nodes.map((node) => node.id));
      added += nodes.length;
      next = next.map((root) => updateNode(root, parentId, (node) => ({ ...node, children: [...node.children, ...nodes] })));
    }

    return { goals: next, createdIds, added, blocked };
  }

  // Modern default behavior: delegate to addBlueprintChildrenBulk without blocking
  const bulkResult = addBlueprintChildrenBulk(goals, parentIds, rawTitles, {
    kind,
    convertExistingSteps: options?.convertExistingSteps ?? true,
  });

  return {
    goals: bulkResult.goals,
    createdIds: bulkResult.createdIds,
    added: bulkResult.count,
    blocked: 0,
  };
}
```

---

## 6. Sibling Deduplication and UID Generation Semantics

### 6.1 Sibling Title Deduplication Semantics
1. **Scope:** **Strictly per-parent.**
   - Sibling names under the same parent must be unique.
   - Sibling names across different parents may be identical.
2. **Comparison:** Case-insensitive, whitespace-collapsed:
   ```ts
   const key = title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
   ```
   - E.g., `"Lecture 1"`, `"lecture 1"`, and `"  lecture   1  "` resolve to the identical key `"lecture 1"`.
3. **Behavior on Match:**
   - If a candidate title already exists under Parent $P$, it is **skipped** on Parent $P$.
   - No exception or error is raised.
   - If the candidate title does not exist under Parent $Q$, it is successfully added to Parent $Q$.

### 6.2 UID Generation Semantics
1. **Entropy Source (`src/lib/ids.ts`):**
   ```ts
   export function uid(prefix = 'n'): string {
     try {
       return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
     } catch {
       return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
     }
   }
   ```
   Using `crypto.randomUUID()` provides 122 bits of cryptographic entropy, preventing collisions across sessions and devices.
2. **Instance Freshness:**
   - A new UID must be generated for **every single node instance created**.
   - If 5 parents each receive 3 new child nodes, exactly 15 fresh UIDs are minted via `uid('goal')`.
   - Never generate one UID per title and share it across parents. Tree traversal algorithms (`findNode`, `findPathToNode`, `updateNode`) assume globally unique IDs across the entire tree.

---

## 7. Interaction with Rest of App & Transaction Safety

### 7.1 Active Focus Session Protection
When an active focus session is running on a task (`activeGoalNodeId`):
1. In the UI (`StudioActionBar`, `StudioNodeExpansionModal`):
   Restructuring or converting the active task node is disabled with feedback: *"Finish the active focus session before restructuring this task."*
2. At the Store Commit Boundary (`src/store.tsx:661-668`):
   ```ts
   if (activeSessionRef.current) {
     const activeTaskId = activeSessionRef.current.taskId;
     const currentActiveTask = currentTasks.find((task) => task.id === activeTaskId);
     const nextActiveTask = nextTasks.find((task) => task.id === activeTaskId);
     if (!currentActiveTask || !nextActiveTask || !sameTasks([currentActiveTask], [nextActiveTask])) {
       return { ok: false, error: 'active-session' };
     }
   }
   ```
   Any change that disrupts the currently running session task is rejected atomically.

### 7.2 Daily Task Reconciliation (`reconcileBlueprintTasks`)
When a node transitions from an endpoint task to a branch container:
- In `GoalNode`, `todayTaskId` is set to `null`.
- In `reconcileBlueprintTasks` (`src/lib/blueprintStudio.ts:386-407`):
  Completed historical daily cards remain unchanged in history.
  Uncompleted current cards are unlinked safely without orphan errors.

---

## 8. Summary of Proposed Changes for Implementers

| File | Change | Description |
|---|---|---|
| `src/lib/blueprintStudio.ts` | Add `addBlueprintChildrenBulk` | New export adhering to `PROJECT.md` interface contract |
| `src/lib/blueprintStudio.ts` | Add `convertNodeToBranch` | New export implementing R1 conversion from task/leaf to branch |
| `src/lib/blueprintStudio.ts` | Add `convertNodeToTask` | New export implementing R1 conversion from empty leaf to task |
| `src/lib/blueprintStudio.ts` | Update `addBlueprintChildren` | Modernize line 77 to eliminate rigid blocker while supporting legacy flag |
| `src/lib/blueprintStudio.test.ts` | Update test suite | Add unit tests for R1 and R2; update line 59 test to use modern/legacy flag |
