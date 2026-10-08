import React, { useEffect } from 'react';
import { ListChecks, Folder, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';
import { studioItemPath } from '../../lib/studioWorkspace';

export interface StudioNodeExpansionModalProps {
  controller: BlueprintStudioController;
}

export function StudioNodeExpansionModal({ controller }: StudioNodeExpansionModalProps) {
  const { targetNodeIds, draftGoals, closeModal, convertToTask, convertToBranch, openModal } = controller;

  const targetId = targetNodeIds[0];
  const node = targetId ? findGoal(draftGoals, targetId) : null;
  const path = targetId ? studioItemPath(draftGoals, targetId) : '';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModal]);

  const handleConvertToTask = () => {
    if (targetId) {
      if (!(node?.steps && node.steps.length > 0)) {
        convertToTask(targetId);
      }
      openModal('bulk_step_diff', [targetId]);
    } else {
      closeModal();
    }
  };

  const handleConvertToBranch = () => {
    if (targetId) {
      convertToBranch(targetId, { convertExistingSteps: true });
      openModal('bulk_add_inside', [targetId]);
    } else {
      closeModal();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-md bg-surface border border-border-subtle rounded-2xl shadow-elevated overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-expansion-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface">
          <div>
            <h3 id="node-expansion-modal-title" className="text-sm sm:text-base font-semibold text-content-primary">
              How would you like to expand?
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Choose how you want to break down this item
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-1.5 text-content-muted hover:text-content-primary hover:bg-elevated rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 flex flex-col gap-3.5">
          {node && (
            <div className="p-3 rounded-xl bg-elevated border border-border-subtle text-xs">
              <span className="text-content-muted block text-[11px] mb-0.5">Selected item:</span>
              <strong className="text-content-primary text-sm font-semibold block truncate">
                {node.title}
              </strong>
              {path && (
                <span className="text-content-muted text-[11px] mt-0.5 block truncate">
                  {path}
                </span>
              )}
            </div>
          )}

          {/* Option 1: Checklist Steps */}
          <button
            type="button"
            className="flex items-start gap-3.5 p-3.5 sm:p-4 text-left border border-border-subtle rounded-xl hover:border-secondary hover:bg-secondary-soft/20 transition-all group"
            onClick={handleConvertToTask}
          >
            <div className="mt-0.5 p-2 rounded-lg bg-secondary-soft text-secondary group-hover:scale-105 transition-transform flex-shrink-0">
              <ListChecks size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-content-primary">
                  Add Checklist Steps
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary-soft text-secondary font-medium shrink-0">
                  Actionable Task
                </span>
              </div>
              <div className="text-xs text-content-muted mt-1 leading-relaxed">
                Keep it as an actionable task, and add sub-steps to check off. Best for specific tasks, study sessions, or homework.
              </div>
            </div>
          </button>

          {/* Option 2: Child Nodes */}
          <button
            type="button"
            className="flex items-start gap-3.5 p-3.5 sm:p-4 text-left border border-border-subtle rounded-xl hover:border-primary hover:bg-primary-soft/20 transition-all group"
            onClick={handleConvertToBranch}
          >
            <div className="mt-0.5 p-2 rounded-lg bg-primary-soft text-primary group-hover:scale-105 transition-transform flex-shrink-0">
              <Folder size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-content-primary">
                  Add Sub-items
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-soft text-primary font-medium shrink-0">
                  Add Child Nodes
                </span>
              </div>
              <div className="text-xs text-content-muted mt-1 leading-relaxed">
                Turn it into a folder/branch containing other full tasks. Add child nodes inside.
              </div>
            </div>
          </button>

          <p className="text-[11px] text-content-muted text-center mt-1">
            You can always reorganize, add steps, or convert branches later without losing progress.
          </p>
        </div>
      </div>
    </div>
  );
}
