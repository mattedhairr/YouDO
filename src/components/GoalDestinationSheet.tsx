import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, FolderCheck, FolderInput, Search, Target, X } from 'lucide-react';
import type { GoalNode } from '../types';
import { canMoveGoalNodes, findGoal, findPathToNode, hasGoalExecutionState, isGoalEndpoint } from '../lib/goalTree';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: 'move' | 'copy';
  selectedIds: string[];
  goals: GoalNode[];
  onConfirm: (targetParentId: string | null) => void;
}

export default function GoalDestinationSheet({
  open,
  onClose,
  mode,
  selectedIds,
  goals,
  onConfirm,
}: Props) {
  const [currentPathIds, setCurrentPathIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Find the current target node being viewed
  const currentTargetId = currentPathIds.length > 0 ? currentPathIds[currentPathIds.length - 1] : null;
  const currentTarget = useMemo(() => {
    if (!currentTargetId) return null;
    return findGoal(goals, currentTargetId);
  }, [goals, currentTargetId]);

  // Current level's path chain for breadcrumbs
  const pathChain = useMemo(() => {
    if (!currentTargetId) return [];
    return findPathToNode(goals, currentTargetId);
  }, [goals, currentTargetId]);

  // Get direct branches at this level (skip endpoints with execution state)
  const currentBranches = useMemo(() => {
    const rawList = currentTarget ? currentTarget.children : goals;
    return rawList.filter((node) => {
      // Must not be an endpoint with steps/scheduled work that shouldn't receive children
      if (node.kind !== 'goal' && isGoalEndpoint(node) && hasGoalExecutionState(node)) {
        return false;
      }
      return true;
    });
  }, [currentTarget, goals]);

  // Flattened search results when searching
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;
    const results: { node: GoalNode; path: GoalNode[] }[] = [];
    const traverse = (node: GoalNode, path: GoalNode[]) => {
      const curPath = [...path, node];
      if (node.title.toLowerCase().includes(query)) {
        if (node.kind === 'goal' || !isGoalEndpoint(node) || !hasGoalExecutionState(node)) {
          results.push({ node, path: curPath });
        }
      }
      for (const child of node.children) {
        traverse(child, curPath);
      }
    };
    for (const root of goals) {
      traverse(root, []);
    }
    return results;
  }, [goals, searchQuery]);

  // Check if moving to a specific target is valid
  const isMoveValid = useMemo(() => {
    if (mode === 'copy') return true;
    return canMoveGoalNodes(goals, selectedIds, currentTargetId);
  }, [goals, mode, selectedIds, currentTargetId]);

  // Set of invalid node IDs for move (selected nodes + their descendants)
  const invalidNodeIds = useMemo(() => {
    if (mode !== 'move') return new Set<string>();
    const invalid = new Set<string>(selectedIds);
    for (const root of goals) {
      const checkDescendants = (node: GoalNode, parentIsInvalid: boolean) => {
        const isSelfInvalid = parentIsInvalid || invalid.has(node.id);
        if (isSelfInvalid) invalid.add(node.id);
        for (const child of node.children) {
          checkDescendants(child, isSelfInvalid);
        }
      };
      checkDescendants(root, false);
    }
    return invalid;
  }, [goals, mode, selectedIds]);

  if (!open) return null;

  const handleSelectChild = (childId: string) => {
    setSearchQuery('');
    setCurrentPathIds((prev) => [...prev, childId]);
  };

  const handleGoUp = () => {
    if (currentPathIds.length === 0) return;
    setCurrentPathIds((prev) => prev.slice(0, -1));
  };

  const handleJumpToPath = (index: number) => {
    if (index < 0) {
      setCurrentPathIds([]);
    } else {
      setCurrentPathIds(currentPathIds.slice(0, index + 1));
    }
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel sheet-up p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0">
              <FolderInput size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-primary leading-tight">
                {mode === 'move' ? 'Move' : 'Copy'} {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'}
              </h3>
              <p className="text-[11px] text-content-muted leading-tight mt-0.5">
                Choose the destination branch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-elevated"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search branches..."
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-subtle bg-elevated/70 text-[12px] text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Breadcrumb Bar (when not searching) */}
        {!searchQuery && (
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-subtle shrink-0 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleGoUp}
              disabled={currentPathIds.length === 0}
              className="w-7 h-7 grid place-items-center rounded-md text-content-secondary hover:bg-elevated disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
              aria-label="Go up one level"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 text-[11px] font-medium text-content-muted truncate min-w-0">
              <button
                type="button"
                onClick={() => handleJumpToPath(-1)}
                className={`hover:text-primary transition-colors shrink-0 ${
                  currentPathIds.length === 0 ? 'text-primary font-bold' : ''
                }`}
              >
                All Goals
              </button>
              {pathChain.map((node, index) => {
                const isCurrent = index === pathChain.length - 1;
                return (
                  <span key={node.id} className="flex items-center gap-1 truncate shrink-0">
                    <ChevronRight size={12} className="text-content-muted/60" />
                    <button
                      type="button"
                      onClick={() => handleJumpToPath(index)}
                      className={`truncate max-w-[120px] hover:text-primary transition-colors ${
                        isCurrent ? 'text-primary font-bold' : ''
                      }`}
                    >
                      {node.title}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 min-h-[140px] max-h-[45vh]">
          {searchQuery && searchResults ? (
            /* Search Results View */
            <div className="space-y-1">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-content-muted">
                  No matching branches found
                </div>
              ) : (
                searchResults.map(({ node, path }) => {
                  const isInvalid = invalidNodeIds.has(node.id);
                  const isCurrent = currentTargetId === node.id;
                  const breadcrumb = path.slice(0, -1).map((n) => n.title).join(' › ');
                  return (
                    <button
                      key={node.id}
                      type="button"
                      disabled={isInvalid}
                      onClick={() => {
                        setCurrentPathIds(path.map((n) => n.id));
                        setSearchQuery('');
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        isInvalid
                          ? 'border-subtle bg-elevated/40 opacity-40 cursor-not-allowed'
                          : isCurrent
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-subtle bg-surface hover:bg-elevated hover:border-content-muted/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Folder size={15} className="shrink-0 text-primary" />
                          <span className="text-[13px] font-semibold text-content-primary truncate">
                            {node.title}
                          </span>
                        </div>
                        {breadcrumb && (
                          <p className="mt-0.5 text-[10px] text-content-muted truncate pl-6">
                            {breadcrumb}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={15} className="text-content-muted shrink-0 ml-2" />
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            /* Hierarchical Drill-down View */
            <>
              {/* Destination Highlight Box */}
              <div className="p-3 rounded-xl bg-primary-soft/60 border border-primary/20 flex items-center gap-2.5">
                <FolderCheck size={18} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-primary">
                    Target Location
                  </p>
                  <p className="text-[13px] font-bold text-content-primary truncate">
                    {currentTarget ? currentTarget.title : 'All Goals (Top Level)'}
                  </p>
                </div>
              </div>

              {/* Sub-branches list */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted px-1 mb-1.5">
                  {currentBranches.length > 0 ? 'Select a branch to enter:' : 'No sub-branches'}
                </p>
                {currentBranches.length === 0 ? (
                  <div className="py-6 px-4 text-center rounded-xl border border-dashed border-subtle bg-elevated/30">
                    <p className="text-[12px] text-content-muted">
                      No branches inside here. Items will be placed directly into{' '}
                      <span className="font-semibold text-content-primary">
                        {currentTarget ? currentTarget.title : 'All Goals'}
                      </span>
                      .
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {currentBranches.map((child) => {
                      const isInvalid = invalidNodeIds.has(child.id);
                      const isGoal = child.kind === 'goal';
                      const childCount = child.children.length;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          disabled={isInvalid}
                          onClick={() => handleSelectChild(child.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${
                            isInvalid
                              ? 'border-subtle bg-elevated/30 opacity-40 cursor-not-allowed'
                              : 'border-subtle bg-surface hover:bg-elevated hover:border-content-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {isGoal ? (
                              <Target size={15} className="text-primary shrink-0" />
                            ) : (
                              <Folder size={15} className="text-content-secondary shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px] font-semibold text-content-primary truncate block">
                                {child.title}
                              </span>
                              <span className="text-[10px] text-content-muted block">
                                {isInvalid
                                  ? 'Selected item or inside selection'
                                  : `${childCount} ${childCount === 1 ? 'sub-item' : 'sub-items'}`}
                              </span>
                            </div>
                          </div>
                          {!isInvalid && (
                            <span className="p-1 text-content-muted shrink-0">
                              <ChevronRight size={15} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-subtle flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl text-[12px] font-semibold text-content-secondary hover:bg-surface border border-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isMoveValid}
            onClick={() => onConfirm(currentTargetId)}
            className="flex-1 h-10 rounded-xl text-[12px] font-semibold bg-primary text-on-primary disabled:opacity-40 shadow-sm"
          >
            {mode === 'move' ? 'Move here' : 'Copy here'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
