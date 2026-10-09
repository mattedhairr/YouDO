import { useState, useMemo, useEffect } from 'react';
import { ListChecks, Plus, Trash2, X, Lock, RotateCcw } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';

export interface StudioBulkStepDiffModalProps {
  controller: BlueprintStudioController;
}

interface StepInfo {
  title: string;
  nodeCount: number;
  completedCount: number;
  isLocked: boolean;
}

export function StudioBulkStepDiffModal({ controller }: StudioBulkStepDiffModalProps) {
  const { targetNodeIds, draftGoals, activeGoalNodeId, closeModal, diffSteps } = controller;

  const totalTargets = targetNodeIds.length;
  const isTargetingActiveTask = Boolean(activeGoalNodeId && targetNodeIds.includes(activeGoalNodeId));

  // Collect and aggregate all unique steps across all target nodes
  const stepPrevalenceMap = useMemo(() => {
    const map = new Map<string, StepInfo>();

    for (const id of targetNodeIds) {
      const node = findGoal(draftGoals, id);
      if (!node || !node.steps) continue;

      node.steps.forEach((step, idx) => {
        const trimmed = step.trim();
        if (!trimmed) return;

        const isDone = Boolean(node.stepDone && node.stepDone[idx]);
        const existing = map.get(trimmed);
        if (existing) {
          existing.nodeCount += 1;
          if (isDone) existing.completedCount += 1;
          if (isDone) existing.isLocked = true;
        } else {
          map.set(trimmed, {
            title: trimmed,
            nodeCount: 1,
            completedCount: isDone ? 1 : 0,
            isLocked: isDone,
          });
        }
      });
    }

    return map;
  }, [targetNodeIds, draftGoals]);

  const existingStepList = useMemo(() => {
    return Array.from(stepPrevalenceMap.values());
  }, [stepPrevalenceMap]);

  const [stepsToAdd, setStepsToAdd] = useState<string[]>([]);
  const [stepsToRemove, setStepsToRemove] = useState<Set<string>>(new Set());
  const [newStepText, setNewStepText] = useState('');

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

  const handleAddStep = () => {
    const trimmed = newStepText.trim();
    if (!trimmed) return;

    if (stepsToRemove.has(trimmed)) {
      // If it was marked for removal, restore it
      const next = new Set(stepsToRemove);
      next.delete(trimmed);
      setStepsToRemove(next);
      setNewStepText('');
      return;
    }

    if (!stepsToAdd.includes(trimmed) && !stepPrevalenceMap.has(trimmed)) {
      setStepsToAdd([...stepsToAdd, trimmed]);
      setNewStepText('');
    }
  };

  const handleRemoveExisting = (stepTitle: string) => {
    if (isTargetingActiveTask) return;
    const next = new Set(stepsToRemove);
    next.add(stepTitle);
    setStepsToRemove(next);
  };

  const handleUndoRemove = (stepTitle: string) => {
    const next = new Set(stepsToRemove);
    next.delete(stepTitle);
    setStepsToRemove(next);
  };

  const handleRemoveNewlyAdded = (stepTitle: string) => {
    setStepsToAdd(stepsToAdd.filter((s) => s !== stepTitle));
  };

  const handleSave = () => {
    if (stepsToAdd.length > 0 || stepsToRemove.size > 0) {
      diffSteps(targetNodeIds, stepsToAdd, Array.from(stepsToRemove), { forceRemoveCompleted: true });
    }
    closeModal();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-lg bg-surface border border-border-subtle rounded-2xl shadow-elevated overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-step-diff-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface">
          <div>
            <h3 id="bulk-step-diff-modal-title" className="text-sm sm:text-base font-semibold text-content-primary">
              Edit Checklist Steps
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Managing steps across {totalTargets} selected item{totalTargets > 1 ? 's' : ''}
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

        {/* Notice for active session task */}
        {isTargetingActiveTask && (
          <div className="px-4 sm:px-5 py-2 bg-secondary-soft/30 border-b border-secondary/20 text-xs text-secondary flex items-center gap-1.5">
            <Lock size={12} className="shrink-0" />
            <span>Active session task selected: completed steps and existing steps are protected from removal.</span>
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* Step List */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-content-secondary">
              Checklist Steps
            </label>

            {existingStepList.length === 0 && stepsToAdd.length === 0 ? (
              <div className="text-center py-8 text-xs text-content-muted bg-surface/50 rounded-xl border border-dashed border-border-subtle">
                No steps yet. Add one below to apply across all selected items.
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Existing Steps */}
                {existingStepList.map((step) => {
                  const isMarkedForRemoval = stepsToRemove.has(step.title);

                  return (
                    <div
                      key={step.title}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                        isMarkedForRemoval
                          ? 'bg-error-soft/30 border-error/30 text-content-muted'
                          : 'bg-base border-border-subtle hover:border-border text-content-primary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <ListChecks
                          size={15}
                          className={isMarkedForRemoval ? 'text-content-muted shrink-0' : 'text-secondary shrink-0'}
                        />
                        <span
                          className={`text-sm truncate select-none ${
                            isMarkedForRemoval ? 'line-through text-content-muted' : 'text-content-primary'
                          }`}
                        >
                          {step.title}
                        </span>

                        {/* Prevalence badge */}
                        {!isMarkedForRemoval && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                              step.nodeCount === totalTargets
                                ? 'bg-primary-soft text-primary'
                                : 'bg-surface border border-border-subtle text-content-muted'
                            }`}
                          >
                            {step.nodeCount === totalTargets ? `All ${totalTargets} nodes` : `${step.nodeCount} of ${totalTargets} nodes`}
                          </span>
                        )}

                        {/* Completed protection badge */}
                        {!isMarkedForRemoval && step.completedCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary-soft text-secondary font-medium shrink-0"
                            title="Completed on some nodes"
                          >
                            <Lock size={10} />
                            <span>{step.completedCount} completed</span>
                          </span>
                        )}

                        {isMarkedForRemoval && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-error-soft text-error font-medium shrink-0">
                            Will remove
                          </span>
                        )}
                      </div>

                      {/* Action toggle */}
                      {isMarkedForRemoval ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-primary hover:bg-primary-soft px-2 py-1 rounded-lg transition-colors shrink-0"
                          title="Undo removal"
                          onClick={() => handleUndoRemove(step.title)}
                        >
                          <RotateCcw size={13} />
                          <span>Undo</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isTargetingActiveTask}
                          className="p-1.5 text-content-muted hover:text-error hover:bg-error-soft disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                          title={isTargetingActiveTask ? 'Active session task steps cannot be removed' : 'Remove step from selected nodes'}
                          onClick={() => handleRemoveExisting(step.title)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Newly Added Steps */}
                {stepsToAdd.map((step) => (
                  <div
                    key={step}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-primary/30 bg-primary-soft/30 text-content-primary"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <Plus size={15} className="text-primary shrink-0" />
                      <span className="text-sm font-medium text-content-primary truncate select-none">
                        {step}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-on-primary font-medium shrink-0">
                        + New (All {totalTargets} nodes)
                      </span>
                    </div>

                    <button
                      type="button"
                      className="p-1.5 text-content-muted hover:text-error hover:bg-error-soft rounded-lg transition-colors shrink-0"
                      title="Discard new step"
                      onClick={() => handleRemoveNewlyAdded(step)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Step Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-content-secondary">
              Add New Step to All Selected Items
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 px-3.5 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="Type a checklist step..."
                value={newStepText}
                onChange={(e) => setNewStepText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddStep();
                  }
                }}
              />
              <button
                type="button"
                disabled={!newStepText.trim()}
                className="p-2 text-on-primary bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm shrink-0"
                onClick={handleAddStep}
                title="Add step"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Diff Summary */}
          {(stepsToAdd.length > 0 || stepsToRemove.size > 0) && (
            <div className="p-2.5 rounded-xl bg-surface border border-border-subtle text-xs text-content-secondary flex items-center justify-between">
              <span className="font-medium text-primary">
                +{stepsToAdd.length} to add
              </span>
              <span className="font-medium text-error">
                -{stepsToRemove.size} to remove
              </span>
              <span className="text-content-muted">
                across {totalTargets} {totalTargets === 1 ? 'item' : 'items'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border-subtle bg-elevated/50 flex justify-end gap-2.5">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-elevated rounded-xl transition-colors"
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-on-primary bg-primary hover:opacity-90 rounded-xl transition-all shadow-sm"
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
