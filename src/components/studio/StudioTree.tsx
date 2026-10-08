import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Target,
  Folder,
  FolderOpen,
  ListChecks,
  Square,
  CheckSquare2,
  CircleDot,
  Plus,
  Calendar,
  Trash2,
} from 'lucide-react';
import type { GoalNode } from '../../types';
import type { BlueprintStudioController } from './blueprintStudioState';

export interface StudioTreeProps {
  controller: BlueprintStudioController;
  searchQuery?: string;
}

interface FilterResult {
  node: GoalNode;
  matchesSelf: boolean;
  matchingChildren: GoalNode[];
}

function filterNode(node: GoalNode, query: string): FilterResult | null {
  const q = query.toLowerCase().trim();
  const matchesSelf = node.title.toLowerCase().includes(q);

  const matchingChildren: GoalNode[] = [];
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const childRes = filterNode(child, query);
      if (childRes) {
        matchingChildren.push(childRes.node);
      }
    }
  }

  if (matchesSelf || matchingChildren.length > 0) {
    return {
      node: {
        ...node,
        children: matchesSelf && matchingChildren.length === 0 ? node.children : matchingChildren,
      },
      matchesSelf,
      matchingChildren,
    };
  }

  return null;
}

export function StudioTree({ controller, searchQuery }: StudioTreeProps) {
  const { draftGoals } = controller;

  if (draftGoals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border-subtle rounded-2xl bg-surface/40 my-4 text-content-muted">
        <Target size={28} className="text-content-muted mb-3 opacity-60" />
        <p className="text-sm font-medium text-content-primary">No goals found</p>
        <p className="text-xs text-content-muted mt-1 max-w-xs mb-4">
          Create a goal to begin drafting your visual breakdown.
        </p>
        <button
          type="button"
          onClick={() => controller.openModal('bulk_add_inside', [])}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>Add Goal</span>
        </button>
      </div>
    );
  }

  const query = (searchQuery || '').trim();
  let displayedGoals = draftGoals;

  if (query) {
    const filtered: GoalNode[] = [];
    for (const goal of draftGoals) {
      const res = filterNode(goal, query);
      if (res) filtered.push(res.node);
    }
    displayedGoals = filtered;

    if (displayedGoals.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border-subtle rounded-2xl bg-surface/40 my-4 text-content-muted">
          <p className="text-sm font-semibold text-content-primary">No matching goals</p>
          <p className="text-xs text-content-muted mt-1">
            No goals matched “{query}”.
          </p>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col py-2 pb-28 space-y-1 relative">
      {displayedGoals.map((goal, index) => (
        <StudioTreeNode
          key={goal.id}
          node={goal}
          depth={0}
          isLastChild={index === displayedGoals.length - 1}
          controller={controller}
          searchQuery={query}
        />
      ))}
      
      {!query && (
        <div className="pt-2 pl-2">
          <button
            type="button"
            onClick={() => controller.openModal('bulk_add_inside', [])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content-muted hover:text-primary hover:bg-primary-soft rounded-lg transition-colors"
          >
            <Plus size={14} />
            <span>Add Goal</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface StudioTreeNodeProps {
  node: GoalNode;
  depth: number;
  isLastChild: boolean;
  controller: BlueprintStudioController;
  searchQuery?: string;
}

function StudioTreeNode({
  node,
  depth,
  controller,
  searchQuery,
}: StudioTreeNodeProps) {
  const {
    selectedIds,
    expandedIds,
    activeGoalNodeId,
    isSelectionMode,
    toggleSelect,
    selectOnly,
    toggleExpand,
    openModal,
    removeNodes,
  } = controller;

  const isSelected = selectedIds.has(node.id);
  const isExpanded = searchQuery ? true : expandedIds.has(node.id);
  const isActiveSession = activeGoalNodeId === node.id;
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const stepCount = node.steps?.length ?? 0;
  const doneCount = (node.stepDone || []).filter(Boolean).length;

  const isGoal = node.kind === 'goal';
  const isBranch = hasChildren;
  const isTask = !hasChildren && stepCount > 0;
  const isLeaf = !hasChildren && stepCount === 0 && !isGoal;

  const handleRowClick = () => {
    if (isSelectionMode) {
      toggleSelect(node.id);
    } else {
      selectOnly(node.id);
    }
  };

  return (
    <div className="flex flex-col relative">
      {/* Horizontal Branch Notch for nested children */}
      {depth > 0 && (
        <span
          className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-2.5 h-px bg-border-subtle/70 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Node Row Container */}
      <div
        className={`group relative flex items-center gap-2 py-1.5 px-2.5 rounded-xl cursor-pointer transition-colors ${
          isActiveSession
            ? 'ring-1 ring-secondary/40 bg-secondary-soft/20 text-content-primary'
            : isSelected
              ? 'bg-primary-soft/50 border border-primary/25 shadow-sm text-content-primary'
              : 'hover:bg-surface border border-transparent hover:border-border-subtle text-content-primary'
        }`}
        onClick={handleRowClick}
        onDoubleClick={() => {
          if (hasChildren) toggleExpand(node.id);
        }}
      >
        {/* Branch Expand/Collapse Chevron */}
        {hasChildren ? (
          <button
            type="button"
            className="p-1 -ml-1 text-content-muted hover:text-content-primary rounded transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <div className="w-5 h-5 flex-shrink-0" />
        )}

        {/* Checkbox */}
        <button
          type="button"
          className="text-content-muted hover:text-primary transition-colors flex-shrink-0"
          aria-label={isSelected ? 'Deselect item' : 'Select item'}
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(node.id);
          }}
        >
          {isSelected ? (
            <CheckSquare2 size={16} className="text-primary" />
          ) : (
            <Square size={16} className="text-content-muted" />
          )}
        </button>

        {/* Semantic Icon */}
        <div className="flex-shrink-0">
          {isGoal ? (
            <Target size={16} className="text-primary" />
          ) : isBranch ? (
            isExpanded ? (
              <FolderOpen size={16} className="text-content-secondary" />
            ) : (
              <Folder size={16} className="text-content-secondary" />
            )
          ) : isTask ? (
            <ListChecks size={16} className="text-secondary" />
          ) : (
            <CircleDot size={15} className="text-content-muted" />
          )}
        </div>

        {/* Title */}
        <span
          className={`text-sm truncate select-none ${
            isGoal ? 'font-semibold text-content-primary' : 'font-medium text-content-primary'
          }`}
        >
          {node.title}
        </span>

        {/* Semantic Badges */}
        {isBranch && (
          <span className="text-[12px] text-content-muted font-medium whitespace-nowrap shrink-0 ml-1">
            {node.children.length} {node.children.length === 1 ? 'item' : 'items'}
          </span>
        )}

        {isTask && (
          <button
            type="button"
            title="Edit checklist steps"
            className="text-[12px] text-content-muted hover:text-secondary font-medium transition-colors whitespace-nowrap shrink-0 ml-1 flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation();
              openModal('bulk_step_diff', [node.id]);
            }}
          >
            {doneCount}/{stepCount} steps
          </button>
        )}

        {/* Active Focus Pill */}
        {isActiveSession && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary-soft/50 text-secondary whitespace-nowrap shrink-0 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse shrink-0" />
            Active Focus
          </span>
        )}

        {/* Right-aligned container for Dates and Hover Actions */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          
          {/* Date Badge */}
          {(node.startDate || node.endDate) && (
            <button
              type="button"
              title="Click to edit dates"
              className="text-[12px] text-content-muted hover:text-content-primary transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              onClick={(e) => {
                e.stopPropagation();
                openModal('date_picker', [node.id]);
              }}
            >
              <Calendar size={14} className="shrink-0" />
              <span>
                {node.startDate || ''}
                {node.startDate && node.endDate ? ' → ' : ''}
                {node.endDate || ''}
              </span>
            </button>
          )}

          {/* Hover / Focus Quick Action Bar */}
          <div className="opacity-0 hidden sm:flex group-hover:opacity-100 group-focus-within:opacity-100 items-center gap-1 transition-opacity">
            {isLeaf && (
              <button
                type="button"
                className="p-1.5 rounded-lg text-content-muted hover:text-primary hover:bg-elevated transition-colors"
                title="Add Inside"
                onClick={(e) => {
                  e.stopPropagation();
                  openModal('node_expansion', [node.id]);
                }}
              >
                <Plus size={16} />
              </button>
            )}
            <button
              type="button"
              className="p-1.5 rounded-lg text-content-muted hover:text-secondary hover:bg-elevated transition-colors"
              title="Edit Steps"
              onClick={(e) => {
                e.stopPropagation();
                openModal('bulk_step_diff', [node.id]);
              }}
            >
              <ListChecks size={16} />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg text-content-muted hover:text-primary hover:bg-elevated transition-colors"
              title="Edit Dates"
              onClick={(e) => {
                e.stopPropagation();
                openModal('date_picker', [node.id]);
              }}
            >
              <Calendar size={16} />
            </button>
            {!isActiveSession && (
              <button
                type="button"
                className="p-1.5 rounded-lg text-content-muted hover:text-error hover:bg-error-soft transition-colors"
                title="Delete Node"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNodes([node.id]);
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Container Trunk Line Guides for nested children */}
      {isExpanded && hasChildren && (
        <div className="relative ml-4 pl-3.5 border-l border-border-subtle/70 space-y-0.5">
          {node.children.map((child, index) => (
            <StudioTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isLastChild={index === node.children.length - 1}
              controller={controller}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}
