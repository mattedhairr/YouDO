import type { GoalKind, GoalNode, Task } from '../types';
import { uid } from './ids';
import { findGoal, hasGoalExecutionState, isGoalEndpoint, isMutableGoalPlan, mirrorGoalContentToTask, removeNodes, updateNode } from './goalTree';

export { sameTree } from './goalTree';

/** Labels used by the v7 root + generic-item composer. Legacy kinds remain readable elsewhere. */
export const BLUEPRINT_LABELS: Record<'goal' | 'node', { singular: string; plural: string; hint: string }> = {
  goal: {
    singular: 'goal',
    plural: 'goals',
    hint: 'The exam-preparation result you want to reach.',
  },
  node: {
    singular: 'item',
    plural: 'items',
    hint: 'A part of your plan. Add items inside it, or leave it as schedulable work.',
  },
};

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

export function numberedBlueprintTitles(prefix: string, start: number, count: number): string[] {
  const cleanPrefix = prefix.trim().replace(/\s+/g, ' ') || 'Item';
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 1;
  const safeCount = Math.max(1, Math.min(100, Math.floor(count) || 1));
  return Array.from({ length: safeCount }, (_, index) => `${cleanPrefix} ${safeStart + index}`);
}

export function makeBlueprintNode(kind: GoalKind, title: string, now = Date.now()): GoalNode {
  return {
    id: uid('goal'),
    kind,
    title: title.trim(),
    children: [],
    steps: kind === 'node' || kind === 'leaf' ? [] : undefined,
    stepDone: kind === 'node' || kind === 'leaf' ? [] : undefined,
    completed: false,
    createdAt: now,
  };
}

export interface ConvertToBranchOptions {
  /**
   * If true, converts existing checklist steps into child GoalNodes,
   * preserving per-step completion states.
   * If false (default), clears steps without converting.
   */
  convertExistingSteps?: boolean;
  kind?: GoalKind;
}

/**
 * Flexible Node Expansion (R1): Converts an empty leaf or task node into a Branch container.
 * - Converts existing checklist steps into child nodes if convertExistingSteps is true.
 * - Appends initialChildTitles as child nodes (deduplicated).
 * - Clears steps, stepDone, and todayTaskId on the converted node.
 * - Maintains the Strict Non-Hybrid Invariant.
 */
export function convertNodeToBranch(
  goals: GoalNode[],
  nodeId: string,
  initialChildTitles: string[] = [],
  options: ConvertToBranchOptions = {},
): GoalNode[] {
  const target = findGoal(goals, nodeId);
  if (!target) return goals;

  const { convertExistingSteps = false, kind = 'node' } = options;
  const titles = normalizeBlueprintTitles(initialChildTitles);

  let convertedStepNodes: GoalNode[] = [];
  if (convertExistingSteps && target.steps && target.steps.length > 0) {
    const parentSteps = target.steps;
    const parentStepDone = target.stepDone ?? [];
    convertedStepNodes = parentSteps.map((step, idx) => {
      const cleanTitle = step.trim();
      return {
        id: uid('goal'),
        kind: 'node' as const,
        title: cleanTitle || `Step ${idx + 1}`,
        children: [],
        steps: [],
        stepDone: [],
        completed: Boolean(parentStepDone[idx]),
        createdAt: Date.now(),
      };
    });
  }

  // Deduplicate initial titles against existing children and converted steps
  const existingTitles = new Set([
    ...target.children.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
    ...convertedStepNodes.map((c) => c.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
  ]);

  const newChildNodes = titles
    .filter((title) => !existingTitles.has(title.toLocaleLowerCase()))
    .map((title) => makeBlueprintNode(kind, title));

  return goals.map((root) =>
    updateNode(root, nodeId, (node) => {
      const allChildren = [...node.children, ...convertedStepNodes, ...newChildNodes];
      const updated: GoalNode = {
        ...node,
        kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
        children: allChildren,
        todayTaskId: null,
        completed: allChildren.length > 0 ? allChildren.every((c) => c.completed) : false,
      };
      delete updated.steps;
      delete updated.stepDone;
      return updated;
    }),
  );
}

/**
 * Flexible Node Expansion (R1): Converts an empty leaf into an Executable Task endpoint.
 * - Sets the node's checklist steps to initialSteps (normalized & deduplicated).
 * - Initializes stepDone to a parallel false array.
 * - Protects branches with active children and root goals from accidental task conversion.
 */
export function convertNodeToTask(
  goals: GoalNode[],
  nodeId: string,
  initialSteps: string[] = [],
): GoalNode[] {
  const target = findGoal(goals, nodeId);
  if (!target) return goals;

  if (target.kind === 'goal' || target.children.length > 0) {
    return goals;
  }

  const steps = normalizeBlueprintTitles(initialSteps);

  return goals.map((root) =>
    updateNode(root, nodeId, (node) => ({
      ...node,
      kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
      steps,
      stepDone: steps.map(() => false),
      completed: false,
    })),
  );
}

export interface AddBlueprintChildrenBulkOptions {
  /**
   * If true, converts existing checklist steps on endpoint parent nodes
   * into child nodes. If false (default), clears steps.
   */
  convertExistingSteps?: boolean;
  /** GoalKind for newly created child nodes. Defaults to 'node'. */
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
 * - Does not block parents with steps: gracefully clears or converts existing steps into sub-items,
 *   maintaining the Strict Non-Hybrid Invariant.
 */
export function addBlueprintChildrenBulk(
  goals: GoalNode[],
  parentIds: string[],
  rawTitles: string[],
  options?: AddBlueprintChildrenBulkOptions | GoalKind,
): AddBlueprintChildrenBulkResult {
  const titles = normalizeBlueprintTitles(rawTitles);
  if (titles.length === 0 || parentIds.length === 0) {
    return { goals, count: 0, createdIds: [] };
  }

  const optObj: AddBlueprintChildrenBulkOptions =
    typeof options === 'string'
      ? { kind: options, convertExistingSteps: false }
      : (options ?? {});
  const { convertExistingSteps = false, kind = 'node' } = optObj;

  const uniqueParentIds = [...new Set(parentIds)];
  let next = goals;
  const createdIds: string[] = [];
  let totalAdded = 0;

  for (const parentId of uniqueParentIds) {
    const parent = findGoal(next, parentId);
    if (!parent) continue;

    let convertedStepNodes: GoalNode[] = [];
    const hadSteps = (parent.steps?.length ?? 0) > 0;
    if (isGoalEndpoint(parent) && hadSteps && convertExistingSteps) {
      const parentSteps = parent.steps ?? [];
      const parentStepDone = parent.stepDone ?? [];
      convertedStepNodes = parentSteps.map((stepTitle, idx) => {
        const cleanTitle = stepTitle.trim();
        return {
          id: uid('goal'),
          kind: 'node' as const,
          title: cleanTitle || `Step ${idx + 1}`,
          children: [],
          steps: [],
          stepDone: [],
          completed: Boolean(parentStepDone[idx]),
          createdAt: Date.now(),
        };
      });
      createdIds.push(...convertedStepNodes.map((n) => n.id));
    }

    const existingTitles = new Set([
      ...parent.children.map((child) => child.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
      ...convertedStepNodes.map((child) => child.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
    ]);

    const nodesToAdd = titles
      .filter((title) => !existingTitles.has(title.toLocaleLowerCase()))
      .map((title) => makeBlueprintNode(kind, title));

    if (nodesToAdd.length === 0 && convertedStepNodes.length === 0) continue;

    createdIds.push(...nodesToAdd.map((node) => node.id));
    totalAdded += nodesToAdd.length;

    next = next.map((root) =>
      updateNode(root, parentId, (node) => {
        const isTransitioningEndpoint = isGoalEndpoint(node) && hadSteps;
        const allChildren = [...node.children, ...convertedStepNodes, ...nodesToAdd];
        const updated: GoalNode = {
          ...node,
          kind: node.kind === 'leaf' || node.kind === 'task' ? 'node' : node.kind,
          children: allChildren,
          completed: allChildren.length > 0 ? allChildren.every((c) => c.completed) : false,
        };
        if (isTransitioningEndpoint || (node.children.length === 0 && allChildren.length > 0)) {
          delete updated.steps;
          delete updated.stepDone;
          if (node.kind !== 'goal') {
            updated.todayTaskId = null;
          }
        }
        return updated;
      }),
    );
  }

  return { goals: next, count: totalAdded, createdIds };
}

export interface AddChildrenResult {
  goals: GoalNode[];
  createdIds: string[];
  added: number;
  blocked: number;
}

/** Add the same ordered child list to every target. Existing sibling titles are skipped per parent. */
export function addBlueprintChildren(
  goals: GoalNode[],
  parentIds: string[],
  kind: GoalKind,
  rawTitles: string[],
  options?: { disallowExecutionState?: boolean; convertExistingSteps?: boolean },
): AddChildrenResult {
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

  const bulkResult = addBlueprintChildrenBulk(goals, parentIds, rawTitles, {
    kind,
    convertExistingSteps: options?.convertExistingSteps ?? false,
  });

  return {
    goals: bulkResult.goals,
    createdIds: bulkResult.createdIds,
    added: bulkResult.count,
    blocked: 0,
  };
}

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
  /** Alias for protectedCompletedCount for test compatibility */
  protectedCount: number;
}

/**
 * Bulk Step Editing (Diffing) (R3).
 * Applies Set-Union additions and Set-Difference removals to target nodes in a single O(N) pass.
 * - Set-Union additions: skips if node already has the step (case-insensitive, whitespace-normalized). Zero duplicates.
 * - Set-Difference removals: skips non-existent steps silently without errors.
 * - Protects completed steps (stepDone[i] === true) from removal unless forceRemoveCompleted is true.
 */
export function diffBlueprintSteps(
  goals: GoalNode[],
  targetNodeIds: string[],
  rawStepsToAdd: string[],
  rawStepsToRemove: string[],
  options?: DiffBlueprintStepsOptions,
): DiffBlueprintStepsResult {
  const targetSet = new Set(targetNodeIds);
  if (targetSet.size === 0 || goals.length === 0) {
    return { goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0, protectedCount: 0 };
  }

  const cleanToAdd = normalizeBlueprintTitles(rawStepsToAdd);
  const removeKeys = new Set(
    rawStepsToRemove
      .map((s) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase())
      .filter((k) => k.length > 0),
  );

  if (cleanToAdd.length === 0 && removeKeys.size === 0) {
    return { goals, affectedCount: 0, addedCount: 0, removedCount: 0, protectedCompletedCount: 0, protectedCount: 0 };
  }

  const forceRemoveCompleted = Boolean(options?.forceRemoveCompleted);

  let affectedCount = 0;
  let addedCount = 0;
  let removedCount = 0;
  let protectedCompletedCount = 0;

  const visit = (node: GoalNode): GoalNode => {
    const nextChildren = node.children.map(visit);
    const childrenChanged = nextChildren.some((child, idx) => child !== node.children[idx]);

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
      const key = step.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

      if (removeKeys.has(key)) {
        if (isDone && !forceRemoveCompleted) {
          preservedSteps.push(step);
          preservedDone.push(isDone);
          nodeProtected++;
        } else {
          nodeRemoved++;
        }
      } else {
        preservedSteps.push(step);
        preservedDone.push(isDone);
      }
    }

    // Phase 2: Set-Union (Additions)
    const existingKeys = new Set(
      preservedSteps.map((s) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase()),
    );
    const newlyAdded: string[] = [];

    for (const addTitle of cleanToAdd) {
      const key = addTitle.toLocaleLowerCase();
      if (!existingKeys.has(key)) {
        newlyAdded.push(addTitle);
        existingKeys.add(key);
      }
    }

    // Phase 3: Check if anything changed on this node
    if (nodeRemoved === 0 && newlyAdded.length === 0 && !childrenChanged) {
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
    protectedCount: protectedCompletedCount,
  };
}

export interface BlueprintStepSummaryItem {
  key: string;
  title: string;
  occurrences: number;
  totalNodes: number;
  isUniversal: boolean;
  allCompleted: boolean;
  anyCompleted: boolean;
  nodeIds: string[];
}

/** Summarizes steps across targeted nodes with occurrence and completion counts for UI diffing. */
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

  const summaryMap = new Map<
    string,
    {
      title: string;
      occurrences: number;
      nodeIds: string[];
      completedCount: number;
    }
  >();

  for (const node of eligibleNodes) {
    const steps = node.steps ?? [];
    const stepDone = node.stepDone ?? steps.map(() => false);
    const seenOnNode = new Set<string>();

    steps.forEach((step, idx) => {
      const key = step.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!key || seenOnNode.has(key)) return;
      seenOnNode.add(key);

      const isDone = Boolean(stepDone[idx]);
      const existing = summaryMap.get(key) ?? {
        title: step.trim().replace(/\s+/g, ' '),
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

  items.sort((a, b) => {
    if (a.isUniversal !== b.isUniversal) return a.isUniversal ? -1 : 1;
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });

  return { items, totalEligibleNodes };
}

export interface AddStepsResult {
  goals: GoalNode[];
  added: number;
  affected: number;
}

export interface RemoveStepsResult {
  goals: GoalNode[];
  removed: number;
  affected: number;
  protectedCompleted: number;
}

/** Append missing steps to endpoint tasks. Duplicate labels are skipped without disturbing completion state. */
export function addBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): AddStepsResult {
  const result = diffBlueprintSteps(goals, nodeIds, rawSteps, []);
  return {
    goals: result.goals,
    added: result.addedCount,
    affected: result.affectedCount,
  };
}

/** Remove matching unfinished steps from endpoint tasks while always preserving completed work. */
export function removeBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): RemoveStepsResult {
  const result = diffBlueprintSteps(goals, nodeIds, [], rawSteps);
  return {
    goals: result.goals,
    removed: result.removedCount,
    affected: result.affectedCount,
    protectedCompleted: result.protectedCompletedCount,
  };
}

/** Strict ISO 8601 calendar date validator (YYYY-MM-DD). */
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

export interface GoalDateInput {
  startDate?: string | null;
  endDate?: string | null;
  clearAll?: boolean;
}

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

export interface SetGoalDatesOptions {
  /**
   * Conflict resolution policy when setting one date that clashes with existing opposing date:
   * - 'clear' (default): Clears the conflicting opposing date.
   * - 'clamp': Adjusts opposing date to match the new date.
   * - 'skip': Skips updating dates on nodes where conflict occurs.
   */
  conflictResolution?: 'clear' | 'clamp' | 'skip';
}

export interface SetGoalDatesBulkResult {
  goals: GoalNode[];
  count: number;
  adjustedCount: number;
}

/**
 * Bulk & Individual Date Changing (R4).
 * Sets or clears startDate and/or endDate across target nodes with strict ISO validation and ordering constraint.
 */
export function setGoalDatesBulk(
  goals: GoalNode[],
  targetNodeIds: string[],
  dates: GoalDateInput,
  options?: SetGoalDatesOptions,
): SetGoalDatesBulkResult {
  const targetSet = new Set(targetNodeIds);
  if (targetSet.size === 0 || goals.length === 0) {
    return { goals, count: 0, adjustedCount: 0 };
  }

  const validation = validateGoalDates(dates);
  if (!validation.valid) {
    return { goals, count: 0, adjustedCount: 0 };
  }

  const conflictResolution = options?.conflictResolution ?? 'clear';

  const isClearAll = Boolean(dates.clearAll);
  const clearStart = isClearAll || dates.startDate === null || (typeof dates.startDate === 'string' && dates.startDate.trim() === '');
  const clearEnd = isClearAll || dates.endDate === null || (typeof dates.endDate === 'string' && dates.endDate.trim() === '');
  const newStart = !clearStart && typeof dates.startDate === 'string' && dates.startDate.trim() !== '' ? dates.startDate.trim() : undefined;
  const newEnd = !clearEnd && typeof dates.endDate === 'string' && dates.endDate.trim() !== '' ? dates.endDate.trim() : undefined;

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

    if (clearStart) {
      finalStart = undefined;
    } else if (newStart !== undefined) {
      finalStart = newStart;
    }

    if (clearEnd) {
      finalEnd = undefined;
    } else if (newEnd !== undefined) {
      finalEnd = newEnd;
    }

    // Check conflict between finalStart and finalEnd if only one date was set
    if (finalStart && finalEnd && finalStart > finalEnd) {
      if (conflictResolution === 'skip') {
        return childrenChanged ? { ...node, children: nextChildren } : node;
      } else if (conflictResolution === 'clamp') {
        if (newStart !== undefined && newEnd === undefined) {
          finalEnd = finalStart;
        } else if (newEnd !== undefined && newStart === undefined) {
          finalStart = finalEnd;
        }
        nodeAdjusted = true;
      } else {
        // Default: 'clear'
        if (newStart !== undefined && newEnd === undefined) {
          finalEnd = undefined;
        } else if (newEnd !== undefined && newStart === undefined) {
          finalStart = undefined;
        }
        nodeAdjusted = true;
      }
    }

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

/** Convenience wrapper for changing dates on a single node. */
export function setGoalDates(
  goals: GoalNode[],
  nodeId: string,
  dates: GoalDateInput,
  options?: SetGoalDatesOptions,
): GoalNode[] {
  return setGoalDatesBulk(goals, [nodeId], dates, options).goals;
}

/** Rename one existing micro-step without changing its completion state. */
export function renameBlueprintStep(goals: GoalNode[], nodeId: string, stepIndex: number, rawTitle: string): GoalNode[] {
  const title = rawTitle.trim().replace(/\s+/g, ' ');
  if (!title || stepIndex < 0) return goals;
  return goals.map((root) => updateNode(root, nodeId, (node) => {
    if (!isGoalEndpoint(node) || node.kind === 'goal' || stepIndex >= (node.steps?.length ?? 0)) return node;
    const steps = [...(node.steps ?? [])];
    steps[stepIndex] = title;
    return { ...node, steps };
  }));
}

export interface BlueprintNodeEdit {
  title: string;
  /** An empty string intentionally clears the optional description. */
  description: string;
}

/** Update labels and optional descriptions without disturbing the branch below. */
export function updateBlueprintNodes(goals: GoalNode[], editsById: Record<string, BlueprintNodeEdit>): GoalNode[] {
  let next = goals;
  for (const [id, edit] of Object.entries(editsById)) {
    const title = edit.title.trim().replace(/\s+/g, ' ');
    if (!title) continue;
    const description = edit.description.trim();
    next = next.map((root) => updateNode(root, id, (node) => {
      const updated: GoalNode = { ...node, title };
      if (description) updated.description = description;
      else delete updated.description;
      return updated;
    }));
  }
  return next;
}

/** Rename helper retained for title-only callers. */
export function renameBlueprintNodes(goals: GoalNode[], titlesById: Record<string, string>): GoalNode[] {
  return updateBlueprintNodes(goals, Object.fromEntries(
    Object.entries(titlesById).map(([id, title]) => [id, { title, description: findBlueprintNodeDescription(goals, id) }]),
  ));
}

function findBlueprintNodeDescription(goals: GoalNode[], id: string): string {
  const node = findGoal(goals, id);
  return node?.description ?? '';
}

/** Remove selected branches once. Descendants of another selected node are ignored as redundant targets. */
export function removeBlueprintNodes(goals: GoalNode[], nodeIds: string[]): GoalNode[] {
  if (!nodeIds || nodeIds.length === 0) return goals;
  const targets = new Set(nodeIds);
  if (targets.size === 0) return goals;
  let changed = false;
  const mapped = goals.map((root) => {
    const next = removeNodes(root, targets);
    if (next !== root) changed = true;
    return next;
  });
  const filtered = mapped.filter((root) => {
    if (targets.has(root.id)) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? filtered : goals;
}

export function flattenBlueprint(goals: GoalNode[]): GoalNode[] {
  const result: GoalNode[] = [];
  const visit = (node: GoalNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  goals.forEach(visit);
  return result;
}

export function countBlueprintNodes(goals: GoalNode[]): number {
  return flattenBlueprint(goals).length;
}

export function maxBlueprintDepth(goals: GoalNode[]): number {
  const depth = (node: GoalNode): number => 1 + Math.max(0, ...node.children.map(depth));
  return Math.max(0, ...goals.map(depth));
}

export function findBlueprintPath(goals: GoalNode[], id: string): GoalNode[] {
  const walk = (node: GoalNode): GoalNode[] => {
    if (node.id === id) return [node];
    for (const child of node.children) {
      const path = walk(child);
      if (path.length) return [node, ...path];
    }
    return [];
  };
  for (const root of goals) {
    const path = walk(root);
    if (path.length) return path;
  }
  return [];
}

/** Resolve a requested Studio location, falling back to the nearest surviving ancestor. */
export function closestBlueprintPathIds(goals: GoalNode[], requestedPath: string[]): string[] {
  for (let index = requestedPath.length - 1; index >= 0; index -= 1) {
    const path = findBlueprintPath(goals, requestedPath[index]);
    if (path.length > 0) return path.map((node) => node.id);
  }
  return [];
}

export interface BlueprintReviewState {
  addedIds: string[];
  changedIds: string[];
  expandedIds: string[];
  addedStepsByNode: Record<string, string[]>;
}

/** Identify the smallest set of review paths that exposes every Studio change. */
export function blueprintReviewState(previousGoals: GoalNode[], nextGoals: GoalNode[]): BlueprintReviewState {
  type IndexedNode = { node: GoalNode; pathIds: string[] };
  const indexTree = (roots: GoalNode[]) => {
    const index = new Map<string, IndexedNode>();
    const visit = (node: GoalNode, parentPath: string[]) => {
      const pathIds = [...parentPath, node.id];
      index.set(node.id, { node, pathIds });
      node.children.forEach((child) => visit(child, pathIds));
    };
    roots.forEach((root) => visit(root, []));
    return index;
  };
  const ownSignature = (node: GoalNode) => JSON.stringify({ ...node, children: undefined });

  const previous = indexTree(previousGoals);
  const next = indexTree(nextGoals);
  const addedIds = new Set<string>();
  const changedIds = new Set<string>();
  const expandedIds = new Set<string>();
  const addedStepsByNode: Record<string, string[]> = {};

  const exposePath = (pathIds: string[]) => pathIds.forEach((id) => expandedIds.add(id));

  for (const [id, entry] of next) {
    const before = previous.get(id)?.node;
    if (!before) {
      addedIds.add(id);
      changedIds.add(id);
      exposePath(entry.pathIds);
      continue;
    }
    if (ownSignature(before) !== ownSignature(entry.node)) {
      changedIds.add(id);
      exposePath(entry.pathIds);
      const oldSteps = new Set((before.steps ?? []).map((step) => step.trim().toLocaleLowerCase()));
      const addedSteps = (entry.node.steps ?? []).filter((step) => !oldSteps.has(step.trim().toLocaleLowerCase()));
      if (addedSteps.length > 0) addedStepsByNode[id] = addedSteps;
    }
  }

  for (const [id, entry] of previous) {
    if (next.has(id)) continue;
    const survivingPath = entry.pathIds.filter((pathId) => next.has(pathId));
    exposePath(survivingPath);
    const survivingParent = survivingPath[survivingPath.length - 1];
    if (survivingParent) changedIds.add(survivingParent);
  }

  return {
    addedIds: [...addedIds],
    changedIds: [...changedIds],
    expandedIds: [...expandedIds],
    addedStepsByNode,
  };
}

export function blueprintChildrenAt(goals: GoalNode[], parentId: string | null): GoalNode[] {
  return parentId ? findGoal(goals, parentId)?.children ?? [] : goals;
}

export interface BlueprintChildGroup {
  key: string;
  title: string;
  nodeIds: string[];
  parentIds: string[];
  parentTitles: string[];
}

/** Group matching direct children so repeated structures can be edited together. */
export function groupBlueprintChildren(goals: GoalNode[], rawParentIds: string[]): BlueprintChildGroup[] {
  const groups = new Map<string, BlueprintChildGroup>();
  for (const parentId of [...new Set(rawParentIds)]) {
    const parent = findGoal(goals, parentId);
    if (!parent) continue;
    for (const child of parent.children) {
      const title = child.title.trim().replace(/\s+/g, ' ');
      const key = title.toLocaleLowerCase();
      if (!key) continue;
      const group = groups.get(key) ?? { key, title, nodeIds: [], parentIds: [], parentTitles: [] };
      if (!group.nodeIds.includes(child.id)) group.nodeIds.push(child.id);
      if (!group.parentIds.includes(parent.id)) {
        group.parentIds.push(parent.id);
        group.parentTitles.push(parent.title);
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

/**
 * Keep only current plan mirrors in sync after an atomic blueprint edit.
 * Historical dated cards are immutable snapshots: renaming, completing, or
 * removing a Goal branch must never rewrite or erase past execution records.
 */
export function reconcileBlueprintTasks(
  tasks: Task[],
  goals: GoalNode[],
  previousGoals: GoalNode[] = goals,
): Task[] {
  const removedCurrentTaskIds = new Set<string>();
  for (const node of flattenBlueprint(previousGoals)) {
    if (findGoal(goals, node.id) || !node.todayTaskId) continue;
    const currentPlan = tasks.find((task) => task.id === node.todayTaskId);
    if (currentPlan && isMutableGoalPlan(currentPlan, node)) {
      removedCurrentTaskIds.add(currentPlan.id);
    }
  }

  return tasks
    .filter((task) => !removedCurrentTaskIds.has(task.id))
    .map((task) => {
      if (!task.goalNodeId) return task;
      const node = findGoal(goals, task.goalNodeId);
      return node && isMutableGoalPlan(task, node) ? mirrorGoalContentToTask(task, node) : task;
    });
}
