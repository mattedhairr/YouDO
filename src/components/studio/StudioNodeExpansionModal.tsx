import { ListChecks, Folder, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';

export function StudioNodeExpansionModal({ controller }: { controller: BlueprintStudioController }) {
  const { targetNodeIds, openModal, closeModal } = controller;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" onClick={closeModal}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">How would you like to expand?</h3>
          <button type="button" onClick={closeModal} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <button
            type="button"
            className="flex items-start gap-3 p-3 text-left border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
            onClick={() => openModal('bulk_step_diff', targetNodeIds)}
          >
            <div className="mt-0.5 p-2 bg-white rounded-lg shadow-sm text-blue-500">
              <ListChecks size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Add Checklist Steps</div>
              <div className="text-xs text-gray-500 mt-1">Keep it as an actionable task, and add sub-steps.</div>
            </div>
          </button>

          <button
            type="button"
            className="flex items-start gap-3 p-3 text-left border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
            onClick={() => openModal('bulk_add_inside', targetNodeIds)}
          >
            <div className="mt-0.5 p-2 bg-white rounded-lg shadow-sm text-blue-500">
              <Folder size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Add Child Nodes</div>
              <div className="text-xs text-gray-500 mt-1">Turn it into a folder/branch containing other full tasks.</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
