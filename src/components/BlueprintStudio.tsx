import React, { useState } from 'react';
import type { GoalNode } from '../types';
import type { GoalTreeChangeResult } from '../store';
import {
  useBlueprintStudioState,
  type BlueprintStudioController,
} from './studio/blueprintStudioState';
import { StudioTree } from './studio/StudioTree';
import { StudioActionBar } from './studio/StudioActionBar';
import { StudioModals } from './studio/StudioModals';
import Overlay from './Overlay';
import './studio/studio.css';
import {
  Undo2,
  Redo2,
  Check,
  ArrowLeft,
  Search,
  X,
  ChevronsDown,
  ChevronsUp,
  AlertCircle,
  Info,
} from 'lucide-react';

export interface BlueprintStudioProps {
  open: boolean;
  goals: GoalNode[];
  initialPathIds?: string[];
  activeGoalNodeId?: string;
  onClose: () => void;
  onCommit: (baseGoals: GoalNode[], nextGoals: GoalNode[], summary: string) => GoalTreeChangeResult;
}

export interface BlueprintStudioContentProps extends Omit<BlueprintStudioProps, 'open'> {
  controller?: BlueprintStudioController;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function BlueprintStudioContent({
  controller: injectedController,
  goals,
  initialPathIds,
  activeGoalNodeId,
  searchQuery: externalSearchQuery,
  onSearchChange,
  onClose,
  onCommit,
}: BlueprintStudioContentProps) {
  const internalController = useBlueprintStudioState({
    goals: goals ?? [],
    initialPathIds,
    activeGoalNodeId,
  });
  const controller = injectedController ?? internalController;

  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchChange ?? setInternalSearchQuery;

  const handleCommit = () => {
    const summary = controller.lastActionDescription || 'Updated studio items';
    const result = onCommit(controller.baseGoals, controller.draftGoals, summary);
    if (result.ok) {
      onClose();
    }
  };

  return (
    <div className="studio" role="dialog" aria-modal="true" aria-label="Blueprint Studio">
      <div className="studio-workspace">
        {/* Header */}
        <header className="studio-header">
          <button
            type="button"
            className="studio-icon-button"
            onClick={onClose}
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="studio-header-title">
            <h1>Blueprint Studio</h1>
          </div>

          {/* Search bar */}
          <div className="studio-search-bar hidden sm:flex items-center gap-1.5 px-2 py-1 bg-surface border border-border-subtle rounded-lg text-content-secondary flex-1 max-w-xs mx-1 min-w-[120px]">
            <Search size={14} className="text-content-muted shrink-0" />
            <input
              type="search"
              aria-label="Search goals"
              placeholder="Search goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none text-xs focus:outline-none text-content-primary placeholder:text-content-muted min-w-0"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="p-0.5 hover:text-content-primary rounded text-content-muted shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex-1 sm:hidden"></div>

          {/* Expand / Collapse All */}
          <button
            type="button"
            className="studio-icon-button shrink-0 hidden sm:inline-flex"
            onClick={() => controller.expandAll()}
            aria-label="Expand all"
            title="Expand all"
          >
            <ChevronsDown size={16} />
          </button>
          <button
            type="button"
            className="studio-icon-button shrink-0 hidden sm:inline-flex"
            onClick={() => controller.collapseAll()}
            aria-label="Collapse all"
            title="Collapse all"
          >
            <ChevronsUp size={16} />
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            className="studio-icon-button shrink-0"
            aria-label="Undo"
            disabled={!controller.canUndo}
            onClick={() => controller.undo()}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="studio-icon-button shrink-0"
            aria-label="Redo"
            disabled={!controller.canRedo}
            onClick={() => controller.redo()}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>

          {/* Save / Commit */}
          <button
            type="button"
            className="studio-save flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ml-1 whitespace-nowrap shrink-0"
            aria-label="Save Changes"
            disabled={!controller.isDirty}
            onClick={handleCommit}
          >
            <Check size={16} className="shrink-0" />
            <span className="hidden sm:inline">Save Changes</span>
            <span className="sm:hidden">Save</span>
          </button>
        </header>

        {/* Error Notification Banner */}
        {controller.errorMessage && (
          <div
            role="alert"
            className="studio-banner-error flex items-center justify-between gap-2 px-3 py-2 bg-error-soft border-b border-error text-error text-xs font-medium"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{controller.errorMessage}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              className="p-1 hover:opacity-80 rounded"
              onClick={controller.clearMessages}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Status Notification Banner */}
        {controller.statusMessage && (
          <div
            role="status"
            className="studio-banner-status flex items-center justify-between gap-2 px-3 py-2 bg-primary-soft border-b border-primary text-primary text-xs font-medium"
          >
            <div className="flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>{controller.statusMessage}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss status"
              className="p-1 hover:opacity-80 rounded"
              onClick={controller.clearMessages}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Main Body: Tree Hierarchy */}
        <div className="studio-scroll flex-1 overflow-y-auto">
          <StudioTree controller={controller} searchQuery={searchQuery} />
        </div>

        {/* Floating Action Bar */}
        <StudioActionBar controller={controller} />

        {/* Modals Sheet Layer */}
        <StudioModals controller={controller} />
      </div>
    </div>
  );
}

export default function BlueprintStudio({
  open,
  goals,
  initialPathIds,
  activeGoalNodeId,
  onClose,
  onCommit,
}: BlueprintStudioProps) {
  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} align="full" scrim={false}>
      <BlueprintStudioContent
        goals={goals}
        initialPathIds={initialPathIds}
        activeGoalNodeId={activeGoalNodeId}
        onClose={onClose}
        onCommit={onCommit}
      />
    </Overlay>
  );
}
