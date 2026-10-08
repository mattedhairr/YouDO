import { useState, useMemo } from 'react';
import { Calendar, X } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';

export function StudioDateModal({ controller }: { controller: BlueprintStudioController }) {
  const { targetNodeIds, draftGoals, closeModal, setDates } = controller;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // If a single node is selected, pre-fill its dates
  useMemo(() => {
    if (targetNodeIds.length === 1) {
      const node = findGoal(draftGoals, targetNodeIds[0]);
      if (node) {
        setStartDate(node.startDate || '');
        setEndDate(node.endDate || '');
      }
    }
  }, [targetNodeIds, draftGoals]);

  const handleSave = () => {
    setDates(targetNodeIds, {
      startDate: startDate.trim() || undefined,
      endDate: endDate.trim() || undefined,
    });
    closeModal();
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setDates(targetNodeIds, { startDate: undefined, endDate: undefined });
    closeModal();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" onClick={closeModal}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Set Dates</h3>
            <p className="text-xs text-gray-500">Applying to {targetNodeIds.length} item{targetNodeIds.length > 1 ? 's' : ''}</p>
          </div>
          <button type="button" onClick={closeModal} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">End Date (Deadline)</label>
            <input
              type="date"
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            onClick={handleClear}
          >
            Clear Dates
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              onClick={handleSave}
            >
              <Calendar size={16} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
