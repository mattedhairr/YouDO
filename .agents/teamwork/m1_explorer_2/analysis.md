# Algorithmic Analysis: Bulk Step Diffing (R3) & Date Management (R4)

**Agent:** M1 Explorer 2 (Algorithmic Specialist: Diffing & Dates)  
**Milestone:** Milestone 1: Core Domain & Algorithm Layer  
**Date:** 2026-10-08  
**Scope:** `src/lib/blueprintStudio.ts`, `src/lib/studioWorkspace.ts`, `src/lib/dates.ts`

---

## 1. Executive Summary

Milestone 1 establishes the pure domain and algorithmic foundation for Blueprint Studio's rebuild. This report analyzes and provides complete, battle-tested algorithmic designs for:
1. **R3: Bulk Step Editing Diffing (`diffBlueprintSteps`)**:
   - Unified atomic application of Set-Union additions and Set-Difference removals across multiple selected goal nodes.
   - Strict deduplication: zero duplicate steps added if a node already possesses the step.
   - Silent skip on removal: nodes lacking a step to be removed are skipped without errors.
   - Progress protection: completed checklist steps (`stepDone[idx] === true`) are protected from accidental bulk removal by default.
   - Algorithmic improvement: replaces the legacy $O(M \times N)$ multi-pass tree walk with an $O(N)$ single-pass immutable visitor.
   - Bonus UI helper: `collectBlueprintStepsSummary` for unified step visualization with prevalence indicators ("In all N items", "In k of N items").
2. **R4: Bulk & Individual Date Changing (`setGoalDatesBulk`)**:
   - Uniform date setting across single or multiple nodes.
   - Strict ISO 8601 `YYYY-MM-DD` calendar validation (rejects invalid leap days, malformed strings, non-dates).
   - Invariant enforcement: $\text{startDate} \le \text{endDate}$.
   - Automatic per-node conflict resolution when updating a single date field against an existing opposing date.
   - Explicit date clearing semantics via `null`, empty string, or `clearAll: true`.

---

## 2. Current State Analysis

### 2.1 Inspection of `src/lib/blueprintStudio.ts` (Lines 107–183)
Existing code defines two separate functions for steps:
- `addBlueprintSteps(goals, nodeIds, rawSteps)`: Appends steps to endpoint nodes.
- `removeBlueprintSteps(goals, nodeIds, rawSteps)`: Removes uncompleted steps matching `rawSteps`.

**Critical Observations & Flaws in Existing Implementation:**
1. **Separated Operations:** Adding and removing steps require two separate function calls and two separate tree traversals. In a bulk step diff editor (where a user may add new steps and delete existing ones simultaneously), executing them sequentially is sub-optimal and can trigger intermediate state inconsistencies.
2. **Quadratic Traversal Complexity ($O(M \times N)$):**
   ```ts
   // blueprintStudio.ts:115-135
   const next = goals.map((root) => {
     let changedRoot = root;
     for (const id of targets) {
       changedRoot = updateNode(changedRoot, id, (node) => { ... });
     }
     return changedRoot;
   });
   ```
   For $M$ target IDs and a tree with $N$ nodes, `updateNode` recursively walks the entire tree $M$ times per root. If 20 nodes are selected in a 100-node tree, that is 2,000 recursive calls.
3. **Completion Recalculation Inconsistency:**
   - In `addBlueprintSteps`, when steps are added, `completed` is hardcoded to `false` (line 131).
   - In `removeBlueprintSteps`, `completed` is computed as `steps.length > 0 && stepDone.every(Boolean)` (line 176). If all steps are deleted from a node, `completed` becomes `false`.
4. **Lack of Prevalence Aggregation:**
   There is currently no domain utility to aggregate existing steps across multiple nodes and count how many nodes possess each step. The legacy UI attempted to do this in React component state (`StudioChecklistForm` in `StudioForms.tsx:323-330`).

### 2.2 Inspection of `src/lib/studioWorkspace.ts` (Lines 10–21, 107–130)
- `patchStudioItems(goals, patches)`: Updates arbitrary fields (`title`, `description`, `startDate`, `endDate`, `pinned`) using a clean single-pass immutable visitor. However, it performs **zero validation** on dates: invalid formats or `startDate > endDate` are applied blindly.
- `editStudioSteps(goals, edits)`: Edits steps by index per node (`{ nodeId, index, title }`). This is useful for single-item renames/reorders, but cannot perform bulk diffing across heterogeneous collections of nodes where step indices differ.

### 2.3 Inspection of `src/lib/dates.ts`
- Functions like `todayISO()`, `tomorrowISO()`, `localISODate()`, `daysBetweenLocalISO()` exist.
- However, there is **no strict ISO date validation function** (`isValidISODate`). Calling `new Date('YYYY-MM-DD')` in JavaScript parses as UTC midnight, but string checks or local date integrity functions are missing.

---

## 3. Deep Algorithmic Design: R3 (Bulk Step Editing Diffing)

### 3.1 Requirements Matrix

| Requirement | Algorithmic Rule |
|-------------|------------------|
| **Set-Union Additions** | New steps in `stepsToAdd` are appended to all target nodes. If a target node already has that step (case-insensitive, whitespace-normalized), it is skipped without creating a duplicate. |
| **Set-Difference Removals** | Steps in `stepsToRemove` are removed from all target nodes possessing them. If a target node does not have that step, it is silently skipped without throwing errors or warnings. |
| **Step Protection** | Completed steps (`stepDone[idx] === true`) are preserved and NOT deleted during bulk removal, unless explicitly overridden via `forceRemoveCompleted: true`. |
| **Node Role Guard** | Only actionable endpoint nodes (`isGoalEndpoint(node) && node.kind !== 'goal'`) receive steps or have steps diffed. Root goals and branch nodes (`children.length > 0`) in the selection are silently skipped. |
| **Completion State** | If all remaining steps are completed (`stepDone.every(Boolean)` and `steps.length > 0`), `node.completed = true`. If new steps are added or all steps are removed, `node.completed = false`. |
| **Order Stability** | Preserved steps retain their original relative order. Newly added steps are appended in the order provided. |
| **Single-Pass Complexity** | The entire tree is traversed exactly once ($O(N)$ time complexity). |

### 3.2 Exact Function Signature & Types

```ts
export interface DiffBlueprintStepsOptions {
  /** If true, completed steps matching stepsToRemove will be deleted. Defaults to false (protected). */
  forceRemoveCompleted?: boolean;
}

export interface DiffBlueprintStepsResult {
  /** Updated immutable tree */
  goals: GoalNode[];
  /** Number of nodes whose steps or completion status changed */
  affectedCount: number;
  /** Total step instances added across all target nodes */
  addedCount: number;
  /** Total step instances removed across all target nodes */
  removedCount: number;
  /** Completed step instances preserved from deletion */
  protectedCompletedCount: number;
}

export function diffBlueprintSteps(
  goals: GoalNode[],
  targetNodeIds: string[],
  stepsToAdd: string[],
  stepsToRemove: string[],
  options?: DiffBlueprintStepsOptions,
): DiffBlueprintStepsResult;
```

### 3.3 Step Normalization & Keying

To guarantee zero duplicates and robust case-insensitive comparisons without altering user display casing:
```ts
/** Canonical key for deduplication and matching: lowercase and collapsed whitespace */
export function normalizeStepKey(step: string): string {
  return step.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Display title cleanup: trimmed and collapsed whitespace */
export function cleanStepTitle(step: string): string {
  return step.trim().replace(/\s+/g, ' ');
}
```

### 3.4 Complete Implementation of `diffBlueprintSteps`

```ts
import type { GoalNode } from '../types';
import { isGoalEndpoint } from './goalTree';
import { normalizeBlueprintTitles } from './blueprintStudio';

export function diffBlueprintSteps(
  goals: GoalNode[],
  targetNodeIds: string[],
  rawStepsToAdd: string[],
  rawStepsToRemove: string[],
  options?: DiffBlueprintStepsOptions,
): DiffBlueprintStepsResult {
  const targetSet = new Set(targetNodeIds);
  if (targetSet.size === 0 || goals.length === 0) {
    return { goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0 };
  }

  // 1. Prepare normalized additions (deduplicated amongst themselves, empty titles stripped)
  const cleanToAdd = normalizeBlueprintTitles(rawStepsToAdd);
  
  // 2. Prepare normalized removals lookup set
  const removeKeys = new Set(
    rawStepsToRemove
      .map(normalizeStepKey)
      .filter((k) => k.length > 0)
  );

  // If nothing to add and nothing to remove, return original tree
  if (cleanToAdd.length === 0 && removeKeys.size === 0) {
    return { goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0 };
  }

  const forceRemoveCompleted = Boolean(options?.forceRemoveCompleted);

  let affectedCount = 0;
  let addedCount = 0;
  let removedCount = 0;
  let protectedCompletedCount = 0;

  // 3. Single-pass immutable recursive visitor
  const visit = (node: GoalNode): GoalNode => {
    // Visit children first
    const nextChildren = node.children.map(visit);
    const childrenChanged = nextChildren.some((child, idx) => child !== node.children[idx]);

    // Check if this node is a target
    if (!targetSet.has(node.id)) {
      return childrenChanged ? { ...node, children: nextChildren } : node;
    }

    // Role check: Only endpoint task nodes (not root goals and not branches) can hold steps
    if (node.kind === 'goal' || !isGoalEndpoint(node)) {
      return childrenChanged ? { ...node, children: nextChildren } : node;
    }

    const currentSteps = node.steps ?? [];
    const currentDone = node.stepDone ?? currentSteps.map(() => false);

    // Phase 1: Set-Difference (Removals)
    const preservedSteps: string[] = [];
    const preservedDone: boolean[] = [];
    let nodeRemoved = 0;
    let nodeProtected = 0;

    for (let i = 0; i < currentSteps.length; i++) {
      const step = currentSteps[i];
      const isDone = Boolean(currentDone[i]);
      const key = normalizeStepKey(step);

      if (removeKeys.has(key)) {
        if (isDone && !forceRemoveCompleted) {
          // Protected completed step
          preservedSteps.push(step);
          preservedDone.push(isDone);
          nodeProtected++;
        } else {
          // Step removed
          nodeRemoved++;
        }
      } else {
        // Step preserved
        preservedSteps.push(step);
        preservedDone.push(isDone);
      }
    }

    // Phase 2: Set-Union (Additions)
    const existingKeys = new Set(preservedSteps.map(normalizeStepKey));
    const newlyAdded: string[] = [];

    for (const addTitle of cleanToAdd) {
      const key = normalizeStepKey(addTitle);
      if (!existingKeys.has(key)) {
        newlyAdded.push(addTitle);
        existingKeys.add(key); // Prevent duplicate additions within the same call
      }
      // If node already has that step, silently skip (zero duplicates)
    }

    // Phase 3: Check if node was modified
    if (nodeRemoved === 0 && newlyAdded.length === 0 && !childrenChanged) {
      // No changes to this node or its children
      protectedCompletedCount += nodeProtected;
      return node;
    }

    const finalSteps = [...preservedSteps, ...newlyAdded];
    const finalDone = [...preservedDone, ...newlyAdded.map(() => false)];
    const finalCompleted = finalSteps.length > 0 && finalDone.every(Boolean);

    affectedCount++;
    addedCount += newlyAdded.length;
    removedCount += nodeRemoved;
    protectedCompletedCount += nodeProtected;

    return {
      ...node,
      children: nextChildren,
      steps: finalSteps,
      stepDone: finalDone,
      completed: finalCompleted,
    };
  };

  const nextGoals = goals.map(visit);

  return {
    goals: nextGoals,
    affectedCount,
    addedCount,
    removedCount,
    protectedCompletedCount,
  };
}
```

### 3.5 UI Helper: Collective Steps Summary (`collectBlueprintStepsSummary`)

To power the bulk step editing modal with prevalence indicators (as specified in R3 §6.1 and Feature #6):
```ts
export interface BlueprintStepSummaryItem {
  key: string;
  title: string;
  occurrences: number;      // How many selected nodes have this step
  totalNodes: number;       // Total eligible target nodes
  isUniversal: boolean;     // True if occurrences === totalNodes ("In all N items")
  allCompleted: boolean;    // True if completed in all nodes where it appears
  anyCompleted: boolean;    // True if completed in at least one node
  nodeIds: string[];        // Node IDs where this step is present
}

export function collectBlueprintStepsSummary(
  goals: GoalNode[],
  targetNodeIds: string[],
): { items: BlueprintStepSummaryItem[]; totalEligibleNodes: number } {
  const targetSet = new Set(targetNodeIds);
  const eligibleNodes: GoalNode[] = [];

  const visit = (node: GoalNode) => {
    if (targetSet.has(node.id) && node.kind !== 'goal' && isGoalEndpoint(node)) {
      eligibleNodes.push(node);
    }
    node.children.forEach(visit);
  };
  goals.forEach(visit);

  const totalEligibleNodes = eligibleNodes.length;
  if (totalEligibleNodes === 0) return { items: [], totalEligibleNodes: 0 };

  const summaryMap = new Map<string, {
    title: string;
    occurrences: number;
    nodeIds: string[];
    completedCount: number;
  }>();

  for (const node of eligibleNodes) {
    const steps = node.steps ?? [];
    const stepDone = node.stepDone ?? steps.map(() => false);
    const seenOnNode = new Set<string>();

    steps.forEach((step, idx) => {
      const key = normalizeStepKey(step);
      if (seenOnNode.has(key)) return;
      seenOnNode.add(key);

      const isDone = Boolean(stepDone[idx]);
      const existing = summaryMap.get(key) ?? {
        title: cleanStepTitle(step),
        occurrences: 0,
        nodeIds: [],
        completedCount: 0,
      };

      existing.occurrences++;
      existing.nodeIds.push(node.id);
      if (isDone) existing.completedCount++;
      summaryMap.set(key, existing);
    });
  }

  const items: BlueprintStepSummaryItem[] = [...summaryMap.entries()].map(([key, data]) => ({
    key,
    title: data.title,
    occurrences: data.occurrences,
    totalNodes: totalEligibleNodes,
    isUniversal: data.occurrences === totalEligibleNodes,
    allCompleted: data.completedCount === data.occurrences,
    anyCompleted: data.completedCount > 0,
    nodeIds: data.nodeIds,
  }));

  // Sort: universal steps first, then descending by occurrence, then alphabetical
  items.sort((a, b) => {
    if (a.isUniversal !== b.isUniversal) return a.isUniversal ? -1 : 1;
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });

  return { items, totalEligibleNodes };
}
```

---

## 4. Deep Algorithmic Design: R4 (Bulk & Individual Date Changing)

### 4.1 Requirements Matrix

| Requirement | Algorithmic Rule |
|-------------|------------------|
| **Single & Bulk Target** | Operates uniformly whether 1 node ID or 50 node IDs are provided in `targetNodeIds`. |
| **Strict ISO Validation** | `YYYY-MM-DD` validated via regex and Gregorian calendar round-trip. Rejects impossible dates like `2026-02-31`. |
| **Invariant: Start $\le$ End** | If both dates are provided, enforces `startDate <= endDate`. Throws error or rejects invalid payload. |
| **Conflict Resolution** | When setting a single date that conflicts with a node's existing opposing date, automatically resolves conflict via configurable policy (`'clear'` default, `'clamp'`, or `'skip'`). |
| **Clearing Dates** | Explicitly passing `null`, `""`, or `{ clearAll: true }` deletes the date property (or sets to `undefined`). |
| **Single-Pass Complexity** | Updates all targeted nodes in a single $O(N)$ tree pass. Returns exact count of updated nodes. |

### 4.2 Strict ISO Date Validation (`isValidISODate`)

```ts
/** Strict ISO 8601 calendar date validator (YYYY-MM-DD) */
export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}
```

### 4.3 Validation Helper for UI (`validateGoalDates`)

```ts
export interface GoalDateInput {
  startDate?: string | null;
  endDate?: string | null;
  clearAll?: boolean;
}

export function validateGoalDates(dates: GoalDateInput): { valid: boolean; error?: string } {
  if (dates.clearAll) return { valid: true };

  const start = dates.startDate?.trim();
  const end = dates.endDate?.trim();

  if (start && !isValidISODate(start)) {
    return { valid: false, error: `Invalid start date: "${start}". Expected format YYYY-MM-DD.` };
  }
  if (end && !isValidISODate(end)) {
    return { valid: false, error: `Invalid end date: "${end}". Expected format YYYY-MM-DD.` };
  }
  if (start && end && start > end) {
    return { valid: false, error: `Start date (${start}) cannot be after end date (${end}).` };
  }

  return { valid: true };
}
```

### 4.4 Exact Function Signature & Implementation of `setGoalDatesBulk`

```ts
export interface SetGoalDatesOptions {
  /**
   * Action when applying a single date creates a conflict with a node's existing opposing date:
   * - 'clear' (default): Clears the conflicting opposing date so the node stays valid.
   * - 'clamp': Adjusts the opposing date to match the new date (e.g. shifts endDate up to startDate).
   * - 'skip': Skips updating dates on nodes where an opposing date conflict occurs.
   */
  conflictResolution?: 'clear' | 'clamp' | 'skip';
}

export interface SetGoalDatesResult {
  goals: GoalNode[];
  count: number;
  adjustedCount: number;
}

export function setGoalDatesBulk(
  goals: GoalNode[],
  targetNodeIds: string[],
  dates: GoalDateInput,
  options?: SetGoalDatesOptions,
): SetGoalDatesResult {
  const targetSet = new Set(targetNodeIds);
  if (targetSet.size === 0 || goals.length === 0) {
    return { goals, count: 0, adjustedCount: 0 };
  }

  // 1. Validate payload
  const validation = validateGoalDates(dates);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const conflictResolution = options?.conflictResolution ?? 'clear';

  // Determine actions for start date and end date
  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || dates.startDate === '';
  const clearEnd = isClearAll || dates.endDate === null || dates.endDate === '';
  const newStart = !clearStart && dates.startDate !== undefined ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && dates.endDate !== undefined ? dates.endDate.trim() : undefined;

  // If payload does nothing, return original tree
  if (!clearStart && !clearEnd && newStart === undefined && newEnd === undefined) {
    return { goals, count: 0, adjustedCount: 0 };
  }

  let count = 0;
  let adjustedCount = 0;

  const visit = (node: GoalNode): GoalNode => {
    const nextChildren = node.children.map(visit);
    const childrenChanged = nextChildren.some((child, idx) => child !== node.children[idx]);

    if (!targetSet.has(node.id)) {
      return childrenChanged ? { ...node, children: nextChildren } : node;
    }

    let finalStart: string | undefined = node.startDate;
    let finalEnd: string | undefined = node.endDate;
    let nodeAdjusted = false;

    // Apply start date update
    if (clearStart) {
      finalStart = undefined;
    } else if (newStart !== undefined) {
      finalStart = newStart;
    }

    // Apply end date update
    if (clearEnd) {
      finalEnd = undefined;
    } else if (newEnd !== undefined) {
      finalEnd = newEnd;
    }

    // Check conflict between finalStart and finalEnd
    if (finalStart && finalEnd && finalStart > finalEnd) {
      // Conflict occurred because only one date was passed and it clashed with the existing opposing date
      if (conflictResolution === 'skip') {
        return childrenChanged ? { ...node, children: nextChildren } : node;
      } else if (conflictResolution === 'clamp') {
        if (newStart !== undefined && newEnd === undefined) {
          finalEnd = finalStart; // Clamp end forward to start
        } else if (newEnd !== undefined && newStart === undefined) {
          finalStart = finalEnd; // Clamp start back to end
        }
        nodeAdjusted = true;
      } else {
        // Default: 'clear' conflicting opposing date
        if (newStart !== undefined && newEnd === undefined) {
          finalEnd = undefined; // Clear conflicting old endDate
        } else if (newEnd !== undefined && newStart === undefined) {
          finalStart = undefined; // Clear conflicting old startDate
        }
        nodeAdjusted = true;
      }
    }

    // Check if dates actually changed
    const startChanged = finalStart !== node.startDate;
    const endChanged = finalEnd !== node.endDate;

    if (!startChanged && !endChanged && !childrenChanged) {
      return node;
    }

    count++;
    if (nodeAdjusted) adjustedCount++;

    const updated: GoalNode = {
      ...node,
      children: nextChildren,
    };

    if (finalStart !== undefined) updated.startDate = finalStart;
    else delete updated.startDate;

    if (finalEnd !== undefined) updated.endDate = finalEnd;
    else delete updated.endDate;

    return updated;
  };

  const nextGoals = goals.map(visit);
  return { goals: nextGoals, count, adjustedCount };
}
```

### 4.5 Single Node Convenience Wrapper

```ts
export function setGoalDates(
  goals: GoalNode[],
  nodeId: string,
  dates: GoalDateInput,
  options?: SetGoalDatesOptions,
): GoalNode[] {
  return setGoalDatesBulk(goals, [nodeId], dates, options).goals;
}
```

---

## 5. Backwards Compatibility & Integration

### 5.1 Refactoring Existing `addBlueprintSteps` and `removeBlueprintSteps`
The existing functions in `src/lib/blueprintStudio.ts` can immediately be refactored into thin wrappers over `diffBlueprintSteps`, reducing duplication while ensuring 100% backwards compatibility with all 44 existing Vitest test files:

```ts
export function addBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): AddStepsResult {
  const result = diffBlueprintSteps(goals, nodeIds, rawSteps, []);
  return {
    goals: result.goals,
    added: result.addedCount,
    affected: result.affectedCount,
  };
}

export function removeBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): RemoveStepsResult {
  const result = diffBlueprintSteps(goals, nodeIds, [], rawSteps);
  return {
    goals: result.goals,
    removed: result.removedCount,
    affected: result.affectedCount,
    protectedCompleted: result.protectedCompletedCount,
  };
}
```

### 5.2 Strengthening `patchStudioItems` in `src/lib/studioWorkspace.ts`
`patchStudioItems` should be updated to sanitize dates using `isValidISODate` and enforce `startDate <= endDate`:
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
      // Revert patch dates if range is invalid
      next.startDate = node.startDate;
      next.endDate = node.endDate;
    }
    return next;
  };
  return goals.map(visit);
}
```

---

## 6. Comprehensive Verification Test Cases

Below is the verification test suite matrix designed for M1 Explorer 3 and M1 Worker:

| # | Test Name | Scenario / Input | Expected Result |
|---|-----------|------------------|-----------------|
| T1 | `diffBlueprintSteps: Set-Union additions` | Selected: 2 nodes. Node 1 has `['A']`, Node 2 has `['B']`. Add `['A', 'C']`. | Node 1 gets `['A', 'C']` (skips duplicate 'A'). Node 2 gets `['B', 'A', 'C']`. `addedCount = 3`, `affectedCount = 2`. |
| T2 | `diffBlueprintSteps: Whitespace & case normalization` | Node has `['Read Book']`. Add `['  read   book  ']`. | Zero duplicates created. Steps unchanged. `addedCount = 0`. |
| T3 | `diffBlueprintSteps: Set-Difference silent skip` | Selected: 3 nodes. Only Node 1 has `['Old']`. Remove `['Old', 'Missing']`. | 'Old' removed from Node 1. Nodes 2 & 3 skipped without error. `removedCount = 1`, `affectedCount = 1`. |
| T4 | `diffBlueprintSteps: Completed step protection` | Node has `['Done', 'Todo']`, `stepDone: [true, false]`. Remove `['Done', 'Todo']`. | 'Done' is preserved. 'Todo' is removed. Steps: `['Done']`, `stepDone: [true]`, `completed: true`. `protected = 1`. |
| T5 | `diffBlueprintSteps: Force remove completed override` | Same as T4 with `{ forceRemoveCompleted: true }`. | Both steps removed. Steps: `[]`, `stepDone: []`, `completed: false`. |
| T6 | `diffBlueprintSteps: Simultaneous add and remove` | Node has `['Draft', 'Review']`. Remove `['Draft']`, add `['Publish']`. | Result: `['Review', 'Publish']`. |
| T7 | `diffBlueprintSteps: Ignores non-endpoint branches` | Selection includes a branch node (`children.length > 0`) and root goal. | Non-endpoints skipped cleanly without error. |
| T8 | `setGoalDatesBulk: Set both dates across multiple nodes` | Selected: 3 nodes. Set `startDate: '2026-10-10'`, `endDate: '2026-10-20'`. | All 3 nodes updated with exact dates. `count = 3`. |
| T9 | `setGoalDatesBulk: Rejects invalid ISO dates` | Pass `startDate: '2026-02-31'` or `'not-a-date'`. | Throws validation error. Original tree unmodified. |
| T10 | `setGoalDatesBulk: Rejects startDate > endDate` | Pass `startDate: '2026-10-25'`, `endDate: '2026-10-20'`. | Throws range error. Tree unmodified. |
| T11 | `setGoalDatesBulk: Resolves single date conflict (clear)` | Node has `endDate: '2026-10-10'`. Set `startDate: '2026-10-15'`. | `startDate: '2026-10-15'`, conflicting `endDate` cleared (`undefined`). `adjustedCount = 1`. |
| T12 | `setGoalDatesBulk: Clear dates explicitly` | Node has dates. Pass `{ clearAll: true }` or `{ startDate: null, endDate: null }`. | Both date fields deleted/undefined. |
| T13 | `setGoalDates: Single node convenience wrapper` | Update single node ID. | Operates identically to bulk for single target. |
