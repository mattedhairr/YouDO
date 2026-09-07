import type { GoalNode } from '../types';
import { findGoal, hasGoalExecutionState, isGoalEndpoint, updateNode } from './goalTree';
import { findBlueprintPath, flattenBlueprint, removeBlueprintNodes } from './blueprintStudio';
import { uid } from './ids';

export type StudioFields = Pick<GoalNode, 'title' | 'description' | 'startDate' | 'endDate' | 'pinned'>;
export type StudioPatch = Partial<StudioFields>;

/** IDs, progress, schedules and descendants are never replaced by a detail edit. */
export function patchStudioItems(goals: GoalNode[], patches: Record<string, StudioPatch>): GoalNode[] {
  const visit = (node: GoalNode): GoalNode => {
    const patch = patches[node.id];
    const children = node.children.map(visit);
    const changedChildren = children.some((child, index) => child !== node.children[index]);
    if (!patch && !changedChildren) return node;
    const next = { ...node, ...patch, children: changedChildren ? children : node.children };
    if (patch?.title !== undefined) next.title = patch.title.trim() || node.title;
    return next;
  };
  return goals.map(visit);
}

/** Selecting a parent and its descendant must not copy/move/remove the descendant twice. */
export function topStudioSelection(goals: GoalNode[], ids: string[]): string[] {
  const selected = new Set(ids);
  return [...selected].filter((id) => {
    const path = findBlueprintPath(goals, id);
    return path.length > 0 && !path.slice(0, -1).some((node) => selected.has(node.id));
  });
}

const parentOf = (goals: GoalNode[], id: string) => {
  const path = findBlueprintPath(goals, id);
  return path[path.length - 2]?.id ?? null;
};

export function canMoveStudioItems(goals: GoalNode[], ids: string[], destinationId: string | null): boolean {
  const roots = topStudioSelection(goals, ids);
  if (roots.length === 0) return false;
  if (destinationId === null) return roots.every((id) => {
    const node = findGoal(goals, id)!;
    return node.kind === 'goal' || !isGoalEndpoint(node) || !hasGoalExecutionState(node);
  }) && roots.some((id) => findBlueprintPath(goals, id).length > 1);
  const destination = findGoal(goals, destinationId);
  if (!destination || (destination.kind !== 'goal' && isGoalEndpoint(destination) && hasGoalExecutionState(destination))) return false;
  const destinationPath = findBlueprintPath(goals, destinationId);
  return !destinationPath.some((node) => roots.includes(node.id))
    && roots.some((id) => parentOf(goals, id) !== destinationId);
}

export function moveStudioItems(goals: GoalNode[], ids: string[], destinationId: string | null): GoalNode[] {
  if (!canMoveStudioItems(goals, ids, destinationId)) return goals;
  const roots = topStudioSelection(goals, ids).filter((id) => parentOf(goals, id) !== destinationId);
  const moving = roots.map((id) => findGoal(goals, id)!).map((node) => ({
    ...node,
    kind: destinationId === null ? 'goal' as const : node.kind === 'goal' ? 'node' as const : node.kind,
  }));
  const remaining = removeBlueprintNodes(goals, roots);
  if (destinationId === null) return [...remaining, ...moving];
  return remaining.map((root) => updateNode(root, destinationId, (node) => ({ ...node, children: [...node.children, ...moving] })));
}

/** Copies are fresh plans; their sources keep all recorded work and links. */
export function duplicateStudioItems(goals: GoalNode[], ids: string[]): GoalNode[] {
  const selected = new Set(topStudioSelection(goals, ids));
  const clone = (node: GoalNode): GoalNode => ({
    ...node, id: uid('goal'), completed: false, pinned: false, todayTaskId: null,
    stepDone: node.steps?.map(() => false), createdAt: Date.now(), children: node.children.map(clone),
  });
  const visit = (nodes: GoalNode[]): GoalNode[] => {
    const usedNames = new Set(nodes.map((node) => node.title.toLocaleLowerCase()));
    return nodes.flatMap((node) => {
      const next = { ...node, children: visit(node.children) };
      if (!selected.has(node.id)) return [next];
      let title = `${node.title} (copy)`;
      let number = 2;
      while (usedNames.has(title.toLocaleLowerCase())) title = `${node.title} (copy ${number++})`;
      usedNames.add(title.toLocaleLowerCase());
      return [next, { ...clone(node), title }];
    });
  };
  return visit(goals);
}

/** Move selected siblings one place, preserving their relative order. */
export function reorderStudioItems(goals: GoalNode[], ids: string[], direction: 'up' | 'down'): GoalNode[] {
  const selected = new Set(topStudioSelection(goals, ids));
  const visit = (nodes: GoalNode[]): GoalNode[] => {
    const result = nodes.map((node) => ({ ...node, children: visit(node.children) }));
    if (direction === 'up') {
      for (let i = 1; i < result.length; i++) {
        if (selected.has(result[i].id) && !selected.has(result[i - 1].id)) [result[i - 1], result[i]] = [result[i], result[i - 1]];
      }
    } else {
      for (let i = result.length - 2; i >= 0; i--) {
        if (selected.has(result[i].id) && !selected.has(result[i + 1].id)) [result[i], result[i + 1]] = [result[i + 1], result[i]];
      }
    }
    return result;
  };
  return visit(goals);
}

export type StudioStepEdit = { nodeId: string; index: number; title: string | null };

/** Apply by original index, never by a duplicate label; completed/planned steps cannot be deleted. */
export function editStudioSteps(goals: GoalNode[], edits: StudioStepEdit[]): GoalNode[] {
  const byNode = new Map<string, Map<number, string | null>>();
  edits.forEach(({ nodeId, index, title }) => {
    const nodeEdits = byNode.get(nodeId) ?? new Map<number, string | null>();
    nodeEdits.set(index, title);
    byNode.set(nodeId, nodeEdits);
  });
  const visit = (node: GoalNode): GoalNode => {
    const changes = byNode.get(node.id);
    const children = node.children.map(visit);
    if (!changes || !isGoalEndpoint(node)) return { ...node, children };
    const steps: string[] = [];
    const stepDone: boolean[] = [];
    (node.steps ?? []).forEach((title, index) => {
      const change = changes.get(index);
      const done = Boolean(node.stepDone?.[index]);
      if (change === null && !done && !node.todayTaskId) return;
      steps.push(typeof change === 'string' && change.trim() ? change.trim() : title);
      stepDone.push(done);
    });
    return { ...node, children, steps, stepDone, completed: steps.length > 0 ? stepDone.every(Boolean) : false };
  };
  return goals.map(visit);
}

export function studioItemPath(goals: GoalNode[], id: string): string {
  return findBlueprintPath(goals, id).slice(0, -1).map((node) => node.title).join(' / ') || 'All goals';
}

export type StudioChangeDetail = { id: string; title: string; path: string; detail: string };

/** Human review of actual differences, including moves whose IDs never change. */
export function studioChangeDetails(before: GoalNode[], after: GoalNode[]): StudioChangeDetail[] {
  const previous = new Map(flattenBlueprint(before).map((node) => [node.id, node]));
  const next = new Map(flattenBlueprint(after).map((node) => [node.id, node]));
  const changes: StudioChangeDetail[] = [];
  for (const node of next.values()) {
    const old = previous.get(node.id);
    const path = studioItemPath(after, node.id);
    if (!old) { changes.push({ id: node.id, title: node.title, path, detail: 'Added' }); continue; }
    const details: string[] = [];
    if (old.title !== node.title) details.push('Renamed from “' + old.title + '”');
    if ((old.description ?? '') !== (node.description ?? '')) details.push(node.description ? 'Description edited' : 'Description cleared');
    if (old.startDate !== node.startDate || old.endDate !== node.endDate) details.push('Dates edited');
    if (Boolean(old.pinned) !== Boolean(node.pinned)) details.push(node.pinned ? 'Pinned' : 'Unpinned');
    if (JSON.stringify(old.steps ?? []) !== JSON.stringify(node.steps ?? [])) details.push('Checklist edited');
    if (parentOf(before, node.id) !== parentOf(after, node.id)) details.push('Moved from ' + studioItemPath(before, node.id));
    // Compare retained children only: adding/removing children is not reordering.
    const retainedBefore = old.children.filter((child) => node.children.some((n) => n.id === child.id)).map((child) => child.id);
    const retainedAfter = node.children.filter((child) => old.children.some((n) => n.id === child.id)).map((child) => child.id);
    if (retainedBefore.join('|') !== retainedAfter.join('|')) details.push('Items reordered');
    if (details.length) changes.push({ id: node.id, title: node.title, path, detail: details.join(' · ') });
  }
  for (const node of previous.values()) {
    if (!next.has(node.id)) changes.push({ id: node.id, title: node.title, path: studioItemPath(before, node.id), detail: 'Removed' });
  }
  if (before.filter((node) => next.has(node.id) && !parentOf(after, node.id)).map((n) => n.id).join('|') !== after.filter((node) => previous.has(node.id) && !parentOf(before, node.id)).map((n) => n.id).join('|')) {
    changes.push({ id: 'root-order', title: 'All goals', path: '', detail: 'Goals reordered' });
  }
  return changes;
}
