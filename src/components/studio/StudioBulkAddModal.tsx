import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';

export function StudioBulkAddModal({ controller }: { controller: BlueprintStudioController }) {
  const { targetNodeIds, closeModal, addChildrenInside } = controller;
  const [text, setText] = useState('');

  const handleAdd = () => {
    const lines = text
      .split('\n')
      .map(line => line.replace(/^[\d.-]+\s*/, '').trim())
      .filter(Boolean);
    
    if (lines.length > 0) {
      addChildrenInside(targetNodeIds, lines);
    }
    closeModal();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" onClick={closeModal}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Add Child Nodes</h3>
            <p className="text-xs text-gray-500">Adding to {targetNodeIds.length} selected item{targetNodeIds.length > 1 ? 's' : ''}</p>
          </div>
          <button type="button" onClick={closeModal} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <textarea
            className="w-full min-h-[150px] p-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
            placeholder="Enter one node title per line..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
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
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            onClick={handleAdd}
          >
            <Plus size={16} /> Add Nodes
          </button>
        </div>
      </div>
    </div>
  );
}
