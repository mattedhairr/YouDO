import type { GoalKind, GoalNode, Task } from '../types';
import { uid } from './ids';
import { findGoal, isMutableGoalPlan, mirrorGoalContentToTask, removeNodes, updateNode } from './goalTree';

export const BLUEPRINT_LEVELS: GoalKind[] = ['goal', 'phase', 'section', 'task', 'sub', 'leaf'];

export const BLUEPRINT_LABELS: Record<GoalKind, { singular: string; plural: string; hint: string }> = {
  goal: {
    singular: 'goal',
    plural: 'goals',
    hint: 'The exam-preparation result you want to reach.',
  },
  phase: {
    singular: 'phase',
    plural: 'phases',
    hint: 'A big stage of preparation, such as building fundamentals, covering the syllabus, or revising.',
  },
  section: {
    singular: 'section',
    plural: 'sections',
    hint: 'A group that keeps related subjects or preparation work together inside one phase.',
  },
  task: {
    singular: 'task',
    plural: 'tasks',
    hint: 'A clear piece of study or practice work that produces a result when finished.',
  },
  sub: {
    singular: 'subtask',
    plural: 'subtasks',
    hint: 'A smaller study part that makes a larger task easier to start and finish.',
  },
  leaf: {
    singular: 'leaf task',
    plural: 'leaf tasks',
    hint: 'The smallest piece of preparation you want to schedule and complete separately.',
  },
};

export function nextBlueprintKind(kind: GoalKind): GoalKind | null {
  const index = BLUEPRINT_LEVELS.indexOf(kind);
  return index >= 0 && index < BLUEPRINT_LEVELS.length - 1 ? BLUEPRINT_LEVELS[index + 1] : null;
}

export function nextKindAfter(kind: GoalKind): GoalKind | 'steps' | null {
  return nextBlueprintKind(kind) ?? (kind === 'leaf' ? 'steps' : null);
}

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
    steps: kind === 'leaf' ? [] : undefined,
    stepDone: kind === 'leaf' ? [] : undefined,
    completed: false,
    createdAt: now,
  };
}

export interface AddChildrenResult {
  goals: GoalNode[];
  createdIds: string[];
  added: number;
}

/** Add the same ordered child list to every target. Existing sibling titles are skipped per parent. */
export function addBlueprintChildren(
  goals: GoalNode[],
  parentIds: string[],
  kind: GoalKind,
  rawTitles: string[],
): AddChildrenResult {
  const titles = normalizeBlueprintTitles(rawTitles);
  if (titles.length === 0 || parentIds.length === 0) return { goals, createdIds: [], added: 0 };

  let next = goals;
  const createdIds: string[] = [];
  let added = 0;

  for (const parentId of [...new Set(parentIds)]) {
    const parent = findGoal(next, parentId);
    if (!parent) continue;
    const existing = new Set(parent.children.map((child) => child.title.trim().toLocaleLowerCase()));
    const nodes = titles
      .filter((title) => !existing.has(title.toLocaleLowerCase()))
      .map((title) => makeBlueprintNode(kind, title));
    if (nodes.length === 0) continue;
    createdIds.push(...nodes.map((node) => node.id));
    added += nodes.length;
    next = next.map((root) => updateNode(root, parentId, (node) => ({ ...node, children: [...node.children, ...nodes] })));
  }

  return { goals: next, createdIds, added };
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

/** Append missing steps to leaf nodes. Duplicate labels are skipped without disturbing completion state. */
export function addBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): AddStepsResult {
  const steps = normalizeBlueprintTitles(rawSteps);
  if (steps.length === 0 || nodeIds.length === 0) return { goals, added: 0, affected: 0 };

  let added = 0;
  let affected = 0;
  const targets = new Set(nodeIds);
  const next = goals.map((root) => {
    let changedRoot = root;
    for (const id of targets) {
      changedRoot = updateNode(changedRoot, id, (node) => {
        if (node.kind !== 'leaf') return node;
        const oldSteps = node.steps ?? [];
        const oldDone = node.stepDone ?? oldSteps.map(() => false);
        const existing = new Set(oldSteps.map((step) => step.trim().toLocaleLowerCase()));
        const missing = steps.filter((step) => !existing.has(step.toLocaleLowerCase()));
        if (missing.length === 0) return node;
        added += missing.length;
        affected += 1;
        return {
          ...node,
          steps: [...oldSteps, ...missing],
          stepDone: [...oldDone, ...missing.map(() => false)],
          completed: false,
        };
      });
    }
    return changedRoot;
  });
  return { goals: next, added, affected };
}

/** Remove matching unfinished steps from leaves while always preserving completed work. */
export function removeBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): RemoveStepsResult {
  const selected = new Set(normalizeBlueprintTitles(rawSteps).map((step) => step.toLocaleLowerCase()));
  if (selected.size === 0 || nodeIds.length === 0) {
    return { goals, removed: 0, affected: 0, protectedCompleted: 0 };
  }

  let removed = 0;
  let affected = 0;
  let protectedCompleted = 0;
  const targets = new Set(nodeIds);
  const next = goals.map((root) => {
    let changedRoot = root;
    for (const id of targets) {
      changedRoot = updateNode(changedRoot, id, (node) => {
        if (node.kind !== 'leaf') return node;
        const oldSteps = node.steps ?? [];
        const oldDone = node.stepDone ?? oldSteps.map(() => false);
        const keep = oldSteps.map((step, index) => {
          const matches = selected.has(step.trim().toLocaleLowerCase());
          if (!matches) return true;
          if (oldDone[index]) {
            protectedCompleted += 1;
            return true;
          }
          removed += 1;
          return false;
        });
        if (keep.every(Boolean)) return node;
        affected += 1;
        const steps = oldSteps.filter((_, index) => keep[index]);
        const stepDone = oldDone.filter((_, index) => keep[index]);
        return {
          ...node,
          steps,
          stepDone,
          completed: steps.length > 0 && stepDone.every(Boolean),
        };
      });
    }
    return changedRoot;
  });
  return { goals: next, removed, affected, protectedCompleted };
}

/** Rename one existing micro-step without changing its completion state. */
export function renameBlueprintStep(goals: GoalNode[], nodeId: string, stepIndex: number, rawTitle: string): GoalNode[] {
  const title = rawTitle.trim().replace(/\s+/g, ' ');
  if (!title || stepIndex < 0) return goals;
  return goals.map((root) => updateNode(root, nodeId, (node) => {
    if (node.kind !== 'leaf' || stepIndex >= (node.steps?.length ?? 0)) return node;
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
  const targets = new Set(nodeIds);
  if (targets.size === 0) return goals;
  return goals.map((root) => removeNodes(root, targets)).filter((root) => !targets.has(root.id));
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
