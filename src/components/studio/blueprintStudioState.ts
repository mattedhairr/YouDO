import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { GoalKind, GoalNode } from '../../types';
import {
  addBlueprintChildrenBulk,
  type AddBlueprintChildrenBulkOptions,
  convertNodeToBranch,
  type ConvertToBranchOptions,
  convertNodeToTask,
  diffBlueprintSteps,
  type DiffBlueprintStepsOptions,
  findBlueprintPath,
  flattenBlueprint,
  type GoalDateInput,
  removeBlueprintNodes,
  sameTree,
  setGoalDatesBulk,
  type SetGoalDatesOptions,
  validateGoalDates,
} from '../../lib/blueprintStudio';
import {
  duplicateStudioItems,
  moveStudioItems,
  patchStudioItems,
  type StudioPatch,
  topStudioSelection,
} from '../../lib/studioWorkspace';

export type StudioModalType =
  | 'none'
  | 'node_expansion'
  | 'bulk_add_inside'
  | 'bulk_step_diff'
  | 'date_picker'
  | 'ai_plan';

export interface BlueprintStudioState {
  baseGoals: GoalNode[];
  draftGoals: GoalNode[];
  undoStack: GoalNode[][];
  redoStack: GoalNode[][];
  selectedIds: Set<string>;
  explicitSelectionMode: boolean | null;
  activeModal: StudioModalType;
  targetNodeIds: string[];
  expandedIds: Set<string>;
  activeGoalNodeId?: string;
  errorMessage: string | null;
  statusMessage: string | null;
  lastActionDescription?: string;
}

export type BlueprintStudioAction =
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'SELECT_ONLY'; id: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SELECT_ALL'; goalTrees?: GoalNode[] }
  | { type: 'SET_SELECTION_MODE'; enabled: boolean | null }
  | { type: 'SET_SELECTED_IDS'; selectedIds: Set<string> }
  | { type: 'OPEN_MODAL'; modalType: StudioModalType; targetIds?: string[] }
  | { type: 'CLOSE_MODAL' }
  | { type: 'APPLY_CHANGE'; nextGoals: GoalNode[]; description: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'TOGGLE_EXPAND'; id: string }
  | { type: 'EXPAND_ALL'; goalTrees?: GoalNode[] }
  | { type: 'COLLAPSE_ALL' }
  | { type: 'SET_EXPANDED_IDS'; expandedIds: Set<string> }
  | { type: 'SET_ACTIVE_GOAL_NODE_ID'; id?: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_STATUS'; status: string | null }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'RESET'; goals?: GoalNode[] };

export interface CreateBlueprintStudioOptions {
  goals: GoalNode[];
  initialPathIds?: string[];
  activeGoalNodeId?: string;
  initialSelectedIds?: string[];
  initialExpandedIds?: string[];
}

export function initialBlueprintStudioState(options: CreateBlueprintStudioOptions): BlueprintStudioState {
  const initialGoals = options.goals ?? [];
  const selected = new Set<string>(options.initialSelectedIds ?? []);
  const expanded = new Set<string>(options.initialExpandedIds ?? []);

  if (!options.initialExpandedIds) {
    (options.initialPathIds ?? []).forEach((id) => expanded.add(id));
    initialGoals.forEach((goal) => {
      if (goal.children.length > 0) expanded.add(goal.id);
    });
  }

  return {
    baseGoals: initialGoals,
    draftGoals: initialGoals,
    undoStack: [],
    redoStack: [],
    selectedIds: selected,
    explicitSelectionMode: null,
    activeModal: 'none',
    targetNodeIds: [],
    expandedIds: expanded,
    activeGoalNodeId: options.activeGoalNodeId,
    errorMessage: null,
    statusMessage: null,
    lastActionDescription: undefined,
  };
}

export function blueprintStudioReducer(
  state: BlueprintStudioState,
  action: BlueprintStudioAction,
): BlueprintStudioState {
  switch (action.type) {
    case 'TOGGLE_SELECT': {
      const nextSelected = new Set(state.selectedIds);
      if (nextSelected.has(action.id)) {
        nextSelected.delete(action.id);
      } else {
        nextSelected.add(action.id);
      }
      return {
        ...state,
        selectedIds: nextSelected,
        explicitSelectionMode: nextSelected.size === 0 ? null : state.explicitSelectionMode,
      };
    }

    case 'SELECT_ONLY': {
      return {
        ...state,
        selectedIds: new Set([action.id]),
        explicitSelectionMode: null,
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selectedIds: new Set(),
        explicitSelectionMode: null,
      };
    }

    case 'SELECT_ALL': {
      const trees = action.goalTrees ?? state.draftGoals;
      const allNodes = flattenBlueprint(trees);
      const nextSelected = new Set(allNodes.map((node) => node.id));
      return {
        ...state,
        selectedIds: nextSelected,
        explicitSelectionMode: null,
      };
    }

    case 'SET_SELECTION_MODE': {
      return {
        ...state,
        explicitSelectionMode: action.enabled,
      };
    }

    case 'SET_SELECTED_IDS': {
      return {
        ...state,
        selectedIds: new Set(action.selectedIds),
        explicitSelectionMode: action.selectedIds.size === 0 ? null : state.explicitSelectionMode,
      };
    }

    case 'OPEN_MODAL': {
      if (action.modalType === 'none') {
        return {
          ...state,
          activeModal: 'none',
          targetNodeIds: [],
        };
      }
      const targets = action.targetIds !== undefined
        ? [...action.targetIds]
        : state.selectedIds.size > 0
          ? topStudioSelection(state.draftGoals, Array.from(state.selectedIds))
          : [];

      return {
        ...state,
        activeModal: action.modalType,
        targetNodeIds: targets,
      };
    }

    case 'CLOSE_MODAL': {
      return {
        ...state,
        activeModal: 'none',
        targetNodeIds: [],
      };
    }

    case 'APPLY_CHANGE': {
      if (action.nextGoals === state.draftGoals || sameTree(action.nextGoals, state.draftGoals)) {
        return state;
      }
      return {
        ...state,
        undoStack: [...state.undoStack, state.draftGoals],
        redoStack: [],
        draftGoals: action.nextGoals,
        lastActionDescription: action.description,
        errorMessage: null,
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const prevGoals = state.undoStack[state.undoStack.length - 1];
      const nextUndoStack = state.undoStack.slice(0, -1);
      return {
        ...state,
        undoStack: nextUndoStack,
        redoStack: [...state.redoStack, state.draftGoals],
        draftGoals: prevGoals,
        errorMessage: null,
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const futureGoals = state.redoStack[state.redoStack.length - 1];
      const nextRedoStack = state.redoStack.slice(0, -1);
      return {
        ...state,
        undoStack: [...state.undoStack, state.draftGoals],
        redoStack: nextRedoStack,
        draftGoals: futureGoals,
        errorMessage: null,
      };
    }

    case 'TOGGLE_EXPAND': {
      const nextExpanded = new Set(state.expandedIds);
      if (nextExpanded.has(action.id)) {
        nextExpanded.delete(action.id);
      } else {
        nextExpanded.add(action.id);
      }
      return {
        ...state,
        expandedIds: nextExpanded,
      };
    }

    case 'EXPAND_ALL': {
      const trees = action.goalTrees ?? state.draftGoals;
      const allNodes = flattenBlueprint(trees);
      return {
        ...state,
        expandedIds: new Set(allNodes.map((n) => n.id)),
      };
    }

    case 'COLLAPSE_ALL': {
      return {
        ...state,
        expandedIds: new Set(),
      };
    }

    case 'SET_EXPANDED_IDS': {
      return {
        ...state,
        expandedIds: new Set(action.expandedIds),
      };
    }

    case 'SET_ACTIVE_GOAL_NODE_ID': {
      return {
        ...state,
        activeGoalNodeId: action.id,
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        errorMessage: action.error,
      };
    }

    case 'SET_STATUS': {
      return {
        ...state,
        statusMessage: action.status,
      };
    }

    case 'CLEAR_MESSAGES': {
      return {
        ...state,
        errorMessage: null,
        statusMessage: null,
      };
    }

    case 'RESET': {
      const newGoals = action.goals ?? state.baseGoals;
      return {
        ...state,
        baseGoals: newGoals,
        draftGoals: newGoals,
        undoStack: [],
        redoStack: [],
        selectedIds: new Set(),
        explicitSelectionMode: null,
        activeModal: 'none',
        targetNodeIds: [],
        errorMessage: null,
        statusMessage: null,
        lastActionDescription: undefined,
      };
    }

    default:
      return state;
  }
}

export interface AddChildrenInsideResult {
  success: boolean;
  count: number;
  createdIds: string[];
  error?: string;
}

export interface DiffStepsResult {
  success: boolean;
  affectedCount: number;
  addedCount: number;
  removedCount: number;
  protectedCompletedCount: number;
  error?: string;
}

export interface SetDatesResult {
  success: boolean;
  count: number;
  adjustedCount?: number;
  error?: string;
}

export interface ActionSimpleResult {
  success: boolean;
  error?: string;
}

export interface BlueprintStudioController {
  // State properties
  readonly draftGoals: GoalNode[];
  readonly baseGoals: GoalNode[];
  readonly undoStack: GoalNode[][];
  readonly redoStack: GoalNode[][];
  readonly selectedIds: Set<string>;
  readonly isSelectionMode: boolean;
  readonly activeModal: StudioModalType;
  readonly targetNodeIds: string[];
  readonly expandedIds: Set<string>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDirty: boolean;
  readonly activeGoalNodeId?: string;
  readonly errorMessage: string | null;
  readonly statusMessage: string | null;
  readonly lastActionDescription?: string;

  // Selection
  toggleSelect: (id: string) => void;
  selectOnly: (id: string) => void;
  clearSelection: () => void;
  selectAll: (goalTrees?: GoalNode[]) => void;
  topSelectedIds: (goalTrees?: GoalNode[]) => string[];
  setSelectionMode: (enabled: boolean | null) => void;

  // Modals
  openModal: (modalType: StudioModalType, targetIds?: string[] | string) => void;
  closeModal: () => void;

  // History
  applyChange: (nextGoals: GoalNode[], description: string) => void;
  undo: () => boolean;
  redo: () => boolean;

  // Expansion
  toggleExpand: (id: string) => void;
  expandAll: (goals?: GoalNode[]) => void;
  collapseAll: () => void;

  // Domain Actions
  addChildrenInside: (
    parentIds: string[],
    titles: string[],
    options?: AddBlueprintChildrenBulkOptions | GoalKind,
  ) => AddChildrenInsideResult;

  diffSteps: (
    targetIds: string[],
    stepsToAdd: string[],
    stepsToRemove: string[],
    options?: DiffBlueprintStepsOptions,
  ) => DiffStepsResult;

  setDates: (
    targetIds: string[],
    dates: GoalDateInput,
    options?: SetGoalDatesOptions,
  ) => SetDatesResult;

  convertToBranch: (
    nodeId: string,
    optionsOrTitles?: ConvertToBranchOptions | string[],
    options?: ConvertToBranchOptions,
  ) => ActionSimpleResult;

  convertToTask: (
    nodeId: string,
    initialSteps?: string[],
  ) => ActionSimpleResult;

  removeNodes: (ids: string[]) => { success: boolean; count: number; error?: string };
  duplicateNodes: (ids: string[]) => ActionSimpleResult;
  moveNodes: (ids: string[], destinationId: string | null) => ActionSimpleResult;
  patchItems: (patches: Record<string, StudioPatch>) => ActionSimpleResult;

  // Management & Store API
  setActiveGoalNodeId: (id?: string) => void;
  clearMessages: () => void;
  reset: (newBaseGoals?: GoalNode[]) => void;
  getState: () => BlueprintStudioState;
  getSnapshot: () => BlueprintStudioState;
  subscribe: (listener: () => void) => () => void;
}

export function createBlueprintStudioController(
  options: CreateBlueprintStudioOptions,
): BlueprintStudioController {
  let state = initialBlueprintStudioState(options);
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Safe listener dispatch
      }
    });
  };

  const dispatch = (action: BlueprintStudioAction) => {
    state = blueprintStudioReducer(state, action);
    notify();
  };

  const controller: BlueprintStudioController = {
    get draftGoals(): GoalNode[] {
      return state.draftGoals;
    },
    get baseGoals(): GoalNode[] {
      return state.baseGoals;
    },
    get undoStack(): GoalNode[][] {
      return state.undoStack;
    },
    get redoStack(): GoalNode[][] {
      return state.redoStack;
    },
    get selectedIds(): Set<string> {
      return state.selectedIds;
    },
    get isSelectionMode(): boolean {
      return state.explicitSelectionMode !== null
        ? state.explicitSelectionMode
        : state.selectedIds.size > 0;
    },
    get activeModal(): StudioModalType {
      return state.activeModal;
    },
    get targetNodeIds(): string[] {
      return state.targetNodeIds;
    },
    get expandedIds(): Set<string> {
      return state.expandedIds;
    },
    get canUndo(): boolean {
      return state.undoStack.length > 0;
    },
    get canRedo(): boolean {
      return state.redoStack.length > 0;
    },
    get isDirty(): boolean {
      return JSON.stringify(state.draftGoals) !== JSON.stringify(state.baseGoals);
    },
    get activeGoalNodeId(): string | undefined {
      return state.activeGoalNodeId;
    },
    get errorMessage(): string | null {
      return state.errorMessage;
    },
    get statusMessage(): string | null {
      return state.statusMessage;
    },
    get lastActionDescription(): string | undefined {
      return state.lastActionDescription;
    },

    toggleSelect(id: string) {
      dispatch({ type: 'TOGGLE_SELECT', id });
    },

    selectOnly(id: string) {
      dispatch({ type: 'SELECT_ONLY', id });
    },

    clearSelection() {
      dispatch({ type: 'CLEAR_SELECTION' });
    },

    selectAll(goalTrees?: GoalNode[]) {
      dispatch({ type: 'SELECT_ALL', goalTrees });
    },

    topSelectedIds(goalTrees?: GoalNode[]): string[] {
      const trees = goalTrees ?? state.draftGoals;
      return topStudioSelection(trees, Array.from(state.selectedIds));
    },

    setSelectionMode(enabled: boolean | null) {
      dispatch({ type: 'SET_SELECTION_MODE', enabled });
    },

    openModal(modalType: StudioModalType, targetIds?: string[] | string) {
      const targets =
        targetIds === undefined
          ? undefined
          : Array.isArray(targetIds)
            ? targetIds
            : [targetIds];
      dispatch({ type: 'OPEN_MODAL', modalType, targetIds: targets });
    },

    closeModal() {
      dispatch({ type: 'CLOSE_MODAL' });
    },

    applyChange(nextGoals: GoalNode[], description: string) {
      if (nextGoals === state.draftGoals || sameTree(nextGoals, state.draftGoals)) {
        return;
      }
      dispatch({ type: 'APPLY_CHANGE', nextGoals, description });
    },

    undo(): boolean {
      if (state.undoStack.length === 0) return false;
      dispatch({ type: 'UNDO' });
      return true;
    },

    redo(): boolean {
      if (state.redoStack.length === 0) return false;
      dispatch({ type: 'REDO' });
      return true;
    },

    toggleExpand(id: string) {
      dispatch({ type: 'TOGGLE_EXPAND', id });
    },

    expandAll(goals?: GoalNode[]) {
      dispatch({ type: 'EXPAND_ALL', goalTrees: goals });
    },

    collapseAll() {
      dispatch({ type: 'COLLAPSE_ALL' });
    },

    addChildrenInside(
      parentIds: string[],
      titles: string[],
      options?: AddBlueprintChildrenBulkOptions | GoalKind,
    ): AddChildrenInsideResult {
      if (state.activeGoalNodeId && parentIds.includes(state.activeGoalNodeId)) {
        const errMsg = 'Cannot convert active session task by adding children inside.';
        dispatch({ type: 'SET_ERROR', error: errMsg });
        return { success: false, count: 0, createdIds: [], error: errMsg };
      }

      const result = addBlueprintChildrenBulk(state.draftGoals, parentIds, titles, options);
      if (result.count > 0 || result.createdIds.length > 0) {
        dispatch({
          type: 'APPLY_CHANGE',
          nextGoals: result.goals,
          description: `Added ${result.count} items inside ${parentIds.length} parents`,
        });
        const nextExpanded = new Set(state.expandedIds);
        parentIds.forEach((id) => nextExpanded.add(id));
        dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });
        return { success: true, count: result.count, createdIds: result.createdIds };
      }

      return { success: true, count: 0, createdIds: [] };
    },

    diffSteps(
      targetIds: string[],
      stepsToAdd: string[],
      stepsToRemove: string[],
      options?: DiffBlueprintStepsOptions,
    ): DiffStepsResult {
      const cleanToRemove = stepsToRemove.map((s) => s.trim()).filter((s) => s.length > 0);
      if (state.activeGoalNodeId && targetIds.includes(state.activeGoalNodeId) && cleanToRemove.length > 0) {
        const errMsg = 'Cannot delete steps from active session task.';
        dispatch({ type: 'SET_ERROR', error: errMsg });
        return {
          success: false,
          affectedCount: 0,
          addedCount: 0,
          removedCount: 0,
          protectedCompletedCount: 0,
          error: errMsg,
        };
      }

      const result = diffBlueprintSteps(state.draftGoals, targetIds, stepsToAdd, stepsToRemove, options);
      if (result.affectedCount > 0) {
        dispatch({
          type: 'APPLY_CHANGE',
          nextGoals: result.goals,
          description: `Diffed steps: +${result.addedCount}, -${result.removedCount}`,
        });
      }

      return {
        success: true,
        affectedCount: result.affectedCount,
        addedCount: result.addedCount,
        removedCount: result.removedCount,
        protectedCompletedCount: result.protectedCompletedCount,
      };
    },

    setDates(
      targetIds: string[],
      dates: GoalDateInput,
      options?: SetGoalDatesOptions,
    ): SetDatesResult {
      const validation = validateGoalDates(dates);
      if (!validation.valid) {
        const errMsg = validation.error ?? 'Invalid date input';
        dispatch({ type: 'SET_ERROR', error: errMsg });
        return { success: false, count: 0, adjustedCount: 0, error: errMsg };
      }

      const result = setGoalDatesBulk(state.draftGoals, targetIds, dates, options);
      if (result.count > 0 || result.adjustedCount > 0) {
        dispatch({
          type: 'APPLY_CHANGE',
          nextGoals: result.goals,
          description: `Updated dates on ${result.count} nodes`,
        });
      }

      return { success: true, count: result.count, adjustedCount: result.adjustedCount };
    },

    convertToBranch(
      nodeId: string,
      optionsOrTitles?: ConvertToBranchOptions | string[],
      options?: ConvertToBranchOptions,
    ): ActionSimpleResult {
      if (state.activeGoalNodeId && nodeId === state.activeGoalNodeId) {
        const errMsg = 'Cannot convert active session task to branch.';
        dispatch({ type: 'SET_ERROR', error: errMsg });
        return { success: false, error: errMsg };
      }

      let initialTitles: string[] = [];
      let opt: ConvertToBranchOptions = {};

      if (Array.isArray(optionsOrTitles)) {
        initialTitles = optionsOrTitles;
        opt = options ?? {};
      } else if (optionsOrTitles && typeof optionsOrTitles === 'object') {
        opt = optionsOrTitles;
        if ('initialChildTitles' in optionsOrTitles) {
          const titlesProp = (optionsOrTitles as { initialChildTitles?: string[] }).initialChildTitles;
          if (Array.isArray(titlesProp)) initialTitles = titlesProp;
        }
      }

      const nextGoals = convertNodeToBranch(state.draftGoals, nodeId, initialTitles, opt);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Converted node to branch' });
        const nextExpanded = new Set(state.expandedIds);
        nextExpanded.add(nodeId);
        dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });
      }

      return { success: true };
    },

    convertToTask(nodeId: string, initialSteps?: string[]): ActionSimpleResult {
      if (state.activeGoalNodeId && nodeId === state.activeGoalNodeId) {
        const errMsg = 'Cannot convert active session task.';
        dispatch({ type: 'SET_ERROR', error: errMsg });
        return { success: false, error: errMsg };
      }

      const nextGoals = convertNodeToTask(state.draftGoals, nodeId, initialSteps ?? []);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Converted node to task' });
      }

      return { success: true };
    },

    removeNodes(ids: string[]): { success: boolean; count: number; error?: string } {
      if (!ids || ids.length === 0) {
        return { success: true, count: 0 };
      }

      if (state.activeGoalNodeId) {
        const activePath = findBlueprintPath(state.draftGoals, state.activeGoalNodeId);
        const activePathIds = new Set(activePath.map((node) => node.id));
        if (ids.includes(state.activeGoalNodeId) || ids.some((id) => activePathIds.has(id))) {
          const errMsg = 'Cannot delete active session task or its container.';
          dispatch({ type: 'SET_ERROR', error: errMsg });
          return { success: false, count: 0, error: errMsg };
        }
      }

      const validRoots = topStudioSelection(state.draftGoals, ids);
      if (validRoots.length === 0) {
        return { success: true, count: 0 };
      }

      const nextGoals = removeBlueprintNodes(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals && !sameTree(nextGoals, state.draftGoals)) {
        const nextSelected = new Set(state.selectedIds);
        const nextExpanded = new Set(state.expandedIds);
        ids.forEach((id) => {
          nextSelected.delete(id);
          nextExpanded.delete(id);
        });
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Removed ${validRoots.length} nodes` });
        dispatch({ type: 'SET_SELECTED_IDS', selectedIds: nextSelected });
        dispatch({ type: 'SET_EXPANDED_IDS', expandedIds: nextExpanded });
      }

      return { success: true, count: validRoots.length };
    },

    duplicateNodes(ids: string[]): ActionSimpleResult {
      if (!ids || ids.length === 0 || topStudioSelection(state.draftGoals, ids).length === 0) {
        return { success: true };
      }
      const roots = topStudioSelection(state.draftGoals, ids);
      const nextGoals = duplicateStudioItems(state.draftGoals, ids);
      if (nextGoals !== state.draftGoals && !sameTree(nextGoals, state.draftGoals)) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Duplicated ${roots.length} items` });
      }
      return { success: true };
    },

    moveNodes(ids: string[], destinationId: string | null): ActionSimpleResult {
      const nextGoals = moveStudioItems(state.draftGoals, ids, destinationId);
      if (nextGoals !== state.draftGoals) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: `Moved ${ids.length} items` });
      }
      return { success: true };
    },

    patchItems(patches: Record<string, StudioPatch>): ActionSimpleResult {
      if (!patches || Object.keys(patches).length === 0) {
        return { success: true };
      }
      const nextGoals = patchStudioItems(state.draftGoals, patches);
      if (nextGoals !== state.draftGoals && !sameTree(nextGoals, state.draftGoals)) {
        dispatch({ type: 'APPLY_CHANGE', nextGoals, description: 'Patched items' });
      }
      return { success: true };
    },

    setActiveGoalNodeId(id?: string) {
      dispatch({ type: 'SET_ACTIVE_GOAL_NODE_ID', id });
    },

    clearMessages() {
      dispatch({ type: 'CLEAR_MESSAGES' });
    },

    reset(newBaseGoals?: GoalNode[]) {
      dispatch({ type: 'RESET', goals: newBaseGoals });
    },

    getState(): BlueprintStudioState {
      return state;
    },

    getSnapshot(): BlueprintStudioState {
      return state;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return controller;
}

export const createBlueprintStudioState = createBlueprintStudioController;

export function useBlueprintStudioState(
  options: CreateBlueprintStudioOptions,
): BlueprintStudioController {
  const controller = useMemo(
    () => createBlueprintStudioController(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (controller.activeGoalNodeId !== options.activeGoalNodeId) {
      controller.setActiveGoalNodeId(options.activeGoalNodeId);
    }
  }, [controller, options.activeGoalNodeId]);

  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  return controller;
}
