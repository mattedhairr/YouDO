import { Plus, ListChecks, Calendar, Trash2, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { topStudioSelection } from '../../lib/studioWorkspace';

export function StudioActionBar({ controller }: { controller: BlueprintStudioController }) {
  const { selectedIds, draftGoals, openModal, clearSelection, removeNodes } = controller;

  if (selectedIds.size === 0) return null;

  const selectedCount = selectedIds.size;
  const topIds = topStudioSelection(draftGoals, Array.from(selectedIds));

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-white rounded-xl shadow-lg border border-gray-200 z-10">
      <div className="flex items-center gap-2 px-3 border-r border-gray-200">
        <span className="text-xs font-semibold text-gray-500">{selectedCount} selected</span>
        <button
          type="button"
          className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
          onClick={clearSelection}
        >
          <X size={14} />
        </button>
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        onClick={() => openModal('node_expansion', topIds)}
      >
        <Plus size={16} /> Add Inside
      </button>

      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        onClick={() => openModal('bulk_step_diff', Array.from(selectedIds))}
      >
        <ListChecks size={16} /> Steps
      </button>

      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        onClick={() => openModal('date_picker', Array.from(selectedIds))}
      >
        <Calendar size={16} /> Dates
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <button
        type="button"
        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        onClick={() => removeNodes(Array.from(selectedIds))}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
