import { useState, useMemo } from 'react';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';

export function StudioBulkStepDiffModal({ controller }: { controller: BlueprintStudioController }) {
  const { targetNodeIds, draftGoals, closeModal, diffSteps } = controller;

  // Compute union of all existing steps across targets
  const existingSteps = useMemo(() => {
    const steps = new Set<string>();
    targetNodeIds.forEach(id => {
      const node = findGoal(draftGoals, id);
      if (node && node.steps) {
        node.steps.forEach(step => steps.add(step));
      }
    });
    return Array.from(steps);
  }, [targetNodeIds, draftGoals]);

  const [stepsToAdd, setStepsToAdd] = useState<string[]>([]);
  const [stepsToRemove, setStepsToRemove] = useState<Set<string>>(new Set());
  const [newStepText, setNewStepText] = useState('');

  const currentDisplaySteps = useMemo(() => {
    const combined = [...existingSteps.filter(s => !stepsToRemove.has(s)), ...stepsToAdd];
    return Array.from(new Set(combined));
  }, [existingSteps, stepsToRemove, stepsToAdd]);

  const handleAddStep = () => {
    const trimmed = newStepText.trim();
    if (trimmed && !currentDisplaySteps.includes(trimmed)) {
      if (stepsToRemove.has(trimmed)) {
        // If it was marked for removal, unmark it
        const next = new Set(stepsToRemove);
        next.delete(trimmed);
        setStepsToRemove(next);
      } else if (!existingSteps.includes(trimmed)) {
        // Add to new steps
        setStepsToAdd([...stepsToAdd, trimmed]);
      }
      setNewStepText('');
    }
  };

  const handleRemoveStep = (step: string) => {
    if (stepsToAdd.includes(step)) {
      setStepsToAdd(stepsToAdd.filter(s => s !== step));
    } else if (existingSteps.includes(step)) {
      const next = new Set(stepsToRemove);
      next.add(step);
      setStepsToRemove(next);
    }
  };

  const handleSave = () => {
    if (stepsToAdd.length > 0 || stepsToRemove.size > 0) {
      diffSteps(targetNodeIds, stepsToAdd, Array.from(stepsToRemove));
    }
    closeModal();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" onClick={closeModal}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Edit Checklist Steps</h3>
            <p className="text-xs text-gray-500">Applying to {targetNodeIds.length} selected item{targetNodeIds.length > 1 ? 's' : ''}</p>
          </div>
          <button type="button" onClick={closeModal} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 mb-4">
            {currentDisplaySteps.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No steps yet. Add one below.
              </div>
            ) : (
              currentDisplaySteps.map((step, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg group">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <ListChecks size={14} className="text-gray-400" />
                    <span>{step}</span>
                  </div>
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-white rounded transition-colors"
                    onClick={() => handleRemoveStep(step)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Add a new step..."
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
              className="p-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              onClick={handleAddStep}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
