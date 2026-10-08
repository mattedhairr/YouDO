import React from 'react';
import { Plus, ListChecks, Calendar, Trash2, X, Lock } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { topStudioSelection } from '../../lib/studioWorkspace';
import { findBlueprintPath } from '../../lib/blueprintStudio';

export interface StudioActionBarProps {
  controller: BlueprintStudioController;
}

export function StudioActionBar({ controller }: StudioActionBarProps) {
  const { selectedIds, draftGoals, activeGoalNodeId, openModal, clearSelection, removeNodes } = controller;

  if (selectedIds.size === 0) return null;

  const selectedCount = selectedIds.size;
  const topIds = topStudioSelection(draftGoals, Array.from(selectedIds));

  // Active task protection
  let hasActiveTaskInSelection = false;
  if (activeGoalNodeId) {
    const activePath = findBlueprintPath(draftGoals, activeGoalNodeId);
    const activePathIds = new Set(activePath.map((n) => n.id));
    hasActiveTaskInSelection = topIds.some((id) => id === activeGoalNodeId || activePathIds.has(id));
  }

  const handleDelete = () => {
    if (hasActiveTaskInSelection) return;
    removeNodes(topIds);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 px-3 py-2 bg-surface/95 backdrop-blur-md border border-border-subtle shadow-elevated rounded-2xl z-30 transition-all duration-200 ease-out"
      role="toolbar"
      aria-label="Bulk actions toolbar"
    >
      {/* Selected Count & Clear */}
      <div className="flex items-center gap-2 px-2.5 py-0.5 border-r border-border-subtle">
        <span className="text-xs font-semibold text-content-primary whitespace-nowrap">
          {selectedCount} selected
        </span>
        <button
          type="button"
          className="p-1 hover:bg-elevated rounded-full text-content-muted hover:text-content-primary transition-colors"
          onClick={clearSelection}
          title="Clear selection"
          aria-label="Clear selection"
        >
          <X size={14} />
          <span className="sr-only">Clear</span>
        </button>
      </div>

      {/* Add Inside */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-primary hover:bg-primary-soft rounded-xl transition-colors shrink-0"
        onClick={() => openModal('bulk_add_inside', topIds)}
      >
        <Plus size={16} className="shrink-0" />
        <span className="whitespace-nowrap">Add Inside</span>
      </button>

      {/* Steps */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-elevated rounded-xl transition-colors shrink-0"
        onClick={() => openModal('bulk_step_diff', topIds)}
      >
        <ListChecks size={16} className="shrink-0" />
        <span className="whitespace-nowrap">Steps</span>
      </button>

      {/* Dates */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-elevated rounded-xl transition-colors shrink-0"
        onClick={() => openModal('date_picker', topIds)}
      >
        <Calendar size={16} className="shrink-0" />
        <span className="whitespace-nowrap">Dates</span>
      </button>

      <div className="w-px h-5 bg-border-subtle mx-0.5" />

      {/* Delete / Remove */}
      <button
        type="button"
        disabled={hasActiveTaskInSelection}
        className={`p-2 rounded-xl transition-colors ${
          hasActiveTaskInSelection
            ? 'text-content-muted opacity-40 cursor-not-allowed'
            : 'text-error hover:bg-error-soft'
        }`}
        title={hasActiveTaskInSelection ? 'Cannot delete active session task or its container' : 'Delete selected'}
        aria-label="Delete"
        onClick={handleDelete}
      >
        {hasActiveTaskInSelection ? <Lock size={16} /> : <Trash2 size={16} />}
        <span className="sr-only">Delete</span>
      </button>
    </div>
  );
}
