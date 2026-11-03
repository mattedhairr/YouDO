import { useEffect, useRef, useState } from 'react';
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
import { BLUEPRINT_BACK_EVENT } from '../lib/backSteps';
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

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Back steps out of whatever is open, and never drops unsaved work without asking.
  const goBack = () => {
    const panels = document.querySelectorAll('.studio .studio-panel-scrim:not([aria-hidden="true"])');
    const panelClose = panels[panels.length - 1]?.querySelector<HTMLElement>('[aria-label="Close editor"], [aria-label="Close"]');
    if (panelClose) panelClose.click();
    else if (controller.activeModal !== 'none') controller.closeModal();
    else if (controller.isDirty) setConfirmDiscard(true);
    else onClose();
  };
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => {
    const onBack = () => goBackRef.current();
    window.addEventListener(BLUEPRINT_BACK_EVENT, onBack);
    return () => window.removeEventListener(BLUEPRINT_BACK_EVENT, onBack);
  }, []);

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
            onClick={goBack}
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
        <StudioActionBar controller={controller} searchActive={Boolean(searchQuery?.trim())} />

        {/* Modals Sheet Layer */}
        <StudioModals controller={controller} />
      </div>
      <Overlay open={confirmDiscard} onClose={() => setConfirmDiscard(false)} align="center">
        <div role="alertdialog" aria-label="Discard your changes?" className="w-[min(88vw,22rem)] rounded-[20px] border border-subtle bg-elevated p-5 shadow-sm">
          <h2 className="text-[16px] font-semibold text-content-primary">Discard your changes?</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-content-secondary">Your plan edits haven’t been saved. Leaving now loses them.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDiscard(false)} className="h-10 rounded-xl bg-primary px-4 text-[13px] font-bold text-on-primary">Keep editing</button>
            <button type="button" onClick={() => { setConfirmDiscard(false); onClose(); }} className="h-10 rounded-xl bg-error-soft px-4 text-[13px] font-bold text-error">Discard</button>
          </div>
        </div>
      </Overlay>
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
    <Overlay open={open} onClose={() => window.dispatchEvent(new Event(BLUEPRINT_BACK_EVENT))} align="full" scrim={false} fullWidth="wide" screen>
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
