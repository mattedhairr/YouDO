## 2026-10-08T09:35:06Z
You are M3 Worker 1 for Milestone 3: Headless State Controller.
Your working directory is: d:\Production\Projects\YouDO\.agents\teamwork\m3_worker_1
You MUST read ORIGINAL_REQUEST.md at: d:\Production\Projects\YouDO\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
Also read PROJECT.md at: d:\Production\Projects\YouDO\PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You exclusively own and may edit:
- `src/components/studio/blueprintStudioState.ts`
- `src/components/studio/blueprintStudioState.test.ts`
Do NOT modify other files.

Mission:
Implement the headless state controller / reducer for Blueprint Studio in `src/components/studio/blueprintStudioState.ts` and its comprehensive unit tests in `src/components/studio/blueprintStudioState.test.ts`:
1. Multi-Selection Management:
   - `selectedIds: Set<string>`
   - `toggleSelect(id)`: toggles selection of a node
   - `selectOnly(id)`: sets selection to a single node
   - `clearSelection()`: empties selection
   - `selectAll(goalTrees)`: selects all selectable nodes
   - `topSelectedIds(goalTrees)`: uses `topStudioSelection` from `src/lib/studioWorkspace` so child nodes under selected parents aren't duplicated
   - `isSelectionMode: boolean` (derived from `selectedIds.size > 0` or explicit toggle)
2. Active Sheet / Modal Management:
   - `activeModal`: `'none' | 'node_expansion' | 'bulk_add_inside' | 'bulk_step_diff' | 'date_picker' | 'ai_plan'`
   - `targetNodeIds: string[]` (the nodes being targeted by the active modal, default to selected nodes or single node)
   - `openModal(modalType, targetIds?)`, `closeModal()`
3. Draft History & Undo/Redo Stack:
   - `draftGoals: GoalNode[]`
   - `undoStack: GoalNode[][]`
   - `redoStack: GoalNode[][]`
   - `applyChange(nextGoals: GoalNode[], description: string)`: pushes current state to undoStack, clears redoStack, updates draftGoals
   - `undo()`: pops previous state from undoStack, pushes current to redoStack
   - `redo()`: pops future state from redoStack, pushes current to undoStack
   - `canUndo: boolean`, `canRedo: boolean`, `isDirty: boolean`
4. Tree Folding / Expansion:
   - `expandedIds: Set<string>`
   - `toggleExpand(id)`
   - `expandAll(goals)`, `collapseAll()`
5. Action Dispatchers (integrating M1 domain functions):
   - `addChildrenInside(parentIds, titles)` -> calls `addBlueprintChildrenBulk`
   - `diffSteps(targetIds, stepsToAdd, stepsToRemove, options)` -> calls `diffBlueprintSteps`
   - `setDates(targetIds, dates, options)` -> calls `setGoalDatesBulk`
   - `convertToBranch(nodeId, options)` -> calls `convertNodeToBranch`
   - `convertToTask(nodeId, initialSteps)` -> calls `convertNodeToTask`
   - Guard against active session task: if `activeGoalNodeId` matches targeted node, disallow step deletion or conversion.
6. Comprehensive Unit Tests in `src/components/studio/blueprintStudioState.test.ts`:
   - Test selection toggles, topStudioSelection filtering, selectAll, clear
   - Test modal opening, parameter passing, and closing
   - Test undo and redo stack behavior, boundary conditions, isDirty tracking
   - Test action execution and integration with M1 domain transforms
   - Test active session task guard
7. Run tests:
   `npx vitest run src/components/studio/blueprintStudioState.test.ts`
   `npm test`
