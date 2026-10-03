import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, FolderCheck, FolderInput, Search, Target, Copy, X } from 'lucide-react';
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
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] max-h-[90vh] flex flex-col gap-3">
        {/* Grab Handle */}
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70 shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-2.5 px-1 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0">
            {mode === 'move' ? <FolderInput size={16} /> : <Copy size={16} />}
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-content-primary leading-tight">
              {mode === 'move' ? 'Move' : 'Copy'} {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'}
            </h3>
            <p className="text-[11px] font-medium text-content-muted leading-tight mt-0.5">
              Choose the destination
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative shrink-0 mt-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search branches..."
            className="w-full h-10 pl-9 pr-3 rounded-full border border-subtle bg-surface text-[13px] text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary/50 shadow-sm transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-1"
            >
              <X size={14} strokeWidth={3} />
            </button>
          )}
        </div>

        {/* Breadcrumb Bar (when not searching) */}
        {!searchQuery && (
          <div className="bg-primary-soft/40 border border-primary/20 rounded-2xl px-3 h-11 shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
            <button
              type="button"
              onClick={handleGoUp}
              disabled={currentPathIds.length === 0}
              className="w-7 h-7 grid place-items-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
              aria-label="Go up one level"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <div className="w-px h-4 bg-primary/20 shrink-0" />
            <div className="flex items-center gap-1 text-[12px] font-semibold text-primary truncate min-w-0 pr-2">
              <button
                type="button"
                onClick={() => handleJumpToPath(-1)}
                className={`hover:text-primary transition-colors shrink-0 ${
                  currentPathIds.length === 0 ? 'font-bold' : 'opacity-80'
                }`}
              >
                All Goals
              </button>
              {pathChain.map((node, index) => {
                const isCurrent = index === pathChain.length - 1;
                return (
                  <span key={node.id} className="flex items-center gap-1 truncate shrink-0">
                    <ChevronRight size={13} className="text-primary/40 stroke-[3]" />
                    <button
                      type="button"
                      onClick={() => handleJumpToPath(index)}
                      className={`truncate max-w-[120px] hover:text-primary transition-colors ${
                        isCurrent ? 'font-bold' : 'opacity-80'
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
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-[140px] max-h-[45vh]">
          {searchQuery && searchResults ? (
            /* Search Results View */
            <div className="bg-surface border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle shadow-sm">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-[12px] font-medium text-content-muted">
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
                      className={`w-full flex items-center justify-between px-4 h-14 text-left transition-colors ${
                        isInvalid
                          ? 'bg-elevated/40 opacity-40 cursor-not-allowed'
                          : isCurrent
                          ? 'bg-primary-soft/40'
                          : 'hover:bg-elevated'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Folder size={15} className={isCurrent ? 'text-primary shrink-0' : 'text-content-secondary shrink-0'} />
                          <span className={`text-[13px] font-semibold truncate ${isCurrent ? 'text-primary' : 'text-content-primary'}`}>
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
            <div className="flex flex-col gap-2">
              {/* Destination Highlight Box */}
              <div className="px-3.5 py-3 rounded-2xl bg-surface border border-subtle flex items-center gap-3 shadow-sm shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary-soft text-primary grid place-items-center shrink-0">
                  <FolderCheck size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-content-primary truncate leading-tight">
                    {currentTarget ? currentTarget.title : 'All Goals (Top Level)'}
                  </p>
                  <p className="text-[10px] font-medium text-content-muted truncate mt-0.5">
                    Target Location
                  </p>
                </div>
              </div>

              {/* Sub-branches list */}
              <div className="bg-surface border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle shadow-sm mt-1 shrink-0">
                {currentBranches.length === 0 ? (
                  <div className="py-6 px-4 text-center">
                    <p className="text-[12px] text-content-muted leading-relaxed">
                      No branches inside here.<br/>Items will be placed directly into<br/>
                      <span className="font-semibold text-content-primary">
                        {currentTarget ? currentTarget.title : 'All Goals'}
                      </span>.
                    </p>
                  </div>
                ) : (
                  currentBranches.map((child) => {
                    const isInvalid = invalidNodeIds.has(child.id);
                    const isGoal = child.kind === 'goal';
                    const childCount = child.children.length;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        disabled={isInvalid}
                        onClick={() => handleSelectChild(child.id)}
                        className={`w-full flex items-center justify-between px-3.5 h-12 text-left transition-colors ${
                          isInvalid
                            ? 'bg-elevated/30 opacity-40 cursor-not-allowed'
                            : 'hover:bg-elevated'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isGoal ? (
                            <Target size={15} className="text-primary shrink-0" />
                          ) : (
                            <Folder size={15} className="text-content-secondary shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-[13px] font-semibold text-content-primary truncate block leading-tight">
                              {child.title}
                            </span>
                            {isInvalid ? (
                              <span className="text-[10px] font-medium text-content-muted block mt-0.5 leading-tight">
                                Selected item or inside selection
                              </span>
                            ) : (
                              childCount > 0 && (
                                <span className="text-[10px] font-medium text-content-muted block mt-0.5 leading-tight">
                                  {childCount} {childCount === 1 ? 'sub-item' : 'sub-items'}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                        {!isInvalid && (
                          <span className="text-content-muted shrink-0 ml-2">
                            <ChevronRight size={15} />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-2 shrink-0">
          <button
            type="button"
            disabled={!isMoveValid}
            onClick={() => onConfirm(currentTargetId)}
            className="w-full h-12 rounded-2xl text-[13px] font-bold bg-primary text-on-primary disabled:opacity-40 transition-opacity flex items-center justify-center shadow-sm"
          >
            {mode === 'move' ? 'Move here' : 'Copy here'}
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-surface border border-subtle text-[13px] font-bold text-content-secondary hover:text-content-primary hover:bg-elevated transition-all shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}
