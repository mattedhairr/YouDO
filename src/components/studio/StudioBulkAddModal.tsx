import React, { useState, useMemo, useEffect } from 'react';
import { Plus, X, List, Hash, Type } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';
import { numberedBlueprintTitles, normalizeBlueprintTitles } from '../../lib/blueprintStudio';

export interface StudioBulkAddModalProps {
  controller: BlueprintStudioController;
}

type AddMode = 'list' | 'one' | 'numbered';

export function StudioBulkAddModal({ controller }: StudioBulkAddModalProps) {
  const { targetNodeIds, draftGoals, closeModal, addChildrenInside } = controller;

  const [mode, setMode] = useState<AddMode>('list');
  const [singleTitle, setSingleTitle] = useState('');
  const [listText, setListText] = useState('');
  const [prefix, setPrefix] = useState('Step');
  const [startNum, setStartNum] = useState(1);
  const [sequenceCount, setSequenceCount] = useState(5);

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

  // Target parents summary
  const parentTitles = useMemo(() => {
    return targetNodeIds
      .map((id) => findGoal(draftGoals, id)?.title)
      .filter((t): t is string => Boolean(t));
  }, [targetNodeIds, draftGoals]);

  // Computed titles based on active mode
  const computedTitles = useMemo(() => {
    if (mode === 'one') {
      const trimmed = singleTitle.trim();
      return trimmed ? [trimmed] : [];
    }
    if (mode === 'list') {
      const lines = listText.split('\n');
      return normalizeBlueprintTitles(lines);
    }
    if (mode === 'numbered') {
      return numberedBlueprintTitles(prefix, startNum, sequenceCount);
    }
    return [];
  }, [mode, singleTitle, listText, prefix, startNum, sequenceCount]);

  const totalCreated = computedTitles.length * Math.max(1, targetNodeIds.length);

  const handleAdd = () => {
    if (computedTitles.length > 0) {
      addChildrenInside(targetNodeIds, computedTitles);
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
        aria-labelledby="bulk-add-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface">
          <div>
            <h3 id="bulk-add-modal-title" className="text-sm sm:text-base font-semibold text-content-primary">
              {targetNodeIds.length === 0 ? 'Create New Goals' : 'Add Child Nodes'}
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              {targetNodeIds.length === 0
                ? 'Adding to root level'
                : `Adding inside ${targetNodeIds.length} target parent${targetNodeIds.length > 1 ? 's' : ''}`
              }
              {parentTitles.length > 0 && ` (${parentTitles.slice(0, 2).join(', ')}${parentTitles.length > 2 ? '…' : ''})`}
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

        {/* Mode Switcher */}
        <div className="px-4 sm:px-5 pt-3 pb-1 border-b border-border-subtle/50 bg-elevated/40">
          <div className="flex p-1 bg-surface border border-border-subtle rounded-xl gap-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'list'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                mode === 'list'
                  ? 'bg-primary-soft text-primary font-semibold shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-elevated'
              }`}
              onClick={() => setMode('list')}
            >
              <List size={14} />
              <span>Multi-line List</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'one'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                mode === 'one'
                  ? 'bg-primary-soft text-primary font-semibold shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-elevated'
              }`}
              onClick={() => setMode('one')}
            >
              <Type size={14} />
              <span>Single Item</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'numbered'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                mode === 'numbered'
                  ? 'bg-primary-soft text-primary font-semibold shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-elevated'
              }`}
              onClick={() => setMode('numbered')}
            >
              <Hash size={14} />
              <span>Numbered Sequence</span>
            </button>
          </div>
        </div>

        {/* Body based on mode */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {mode === 'one' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-content-secondary">
                Item Title
              </label>
              <input
                type="text"
                autoFocus
                className="w-full px-3.5 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="e.g. Overview & Introduction"
                value={singleTitle}
                onChange={(e) => setSingleTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
            </div>
          )}

          {mode === 'list' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-content-secondary">
                One Title per Line
              </label>
              <textarea
                autoFocus
                rows={6}
                className="w-full p-3.5 text-sm bg-base border border-border-subtle rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y font-normal"
                placeholder="Enter one node title per line..."
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <p className="text-[11px] text-content-muted">
                Tip: Press Ctrl+Enter to quickly submit. Leading numbers and bullets are automatically cleaned.
              </p>
            </div>
          )}

          {mode === 'numbered' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-content-secondary">
                  Name Prefix
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="e.g. Chapter, Lecture, or Step"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-content-secondary">
                    Start Number
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3.5 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    value={startNum}
                    onChange={(e) => setStartNum(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-content-secondary">
                    Item Count (max 100)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full px-3.5 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    value={sequenceCount}
                    onChange={(e) => setSequenceCount(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-elevated border border-border-subtle text-xs text-content-muted">
                Preview: <span className="text-content-primary font-medium">{computedTitles.slice(0, 3).join(', ')}{computedTitles.length > 3 ? '…' : ''}</span>
              </div>
            </div>
          )}

          {/* Live Impact Preview */}
          <div className="p-3 rounded-xl bg-primary-soft/40 border border-primary/20 text-xs text-content-secondary space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-primary">
                {computedTitles.length} {computedTitles.length === 1 ? 'item' : 'items'} per parent
              </span>
              <span className="font-semibold text-content-primary">
                {totalCreated} total {totalCreated === 1 ? 'node' : 'nodes'}
              </span>
            </div>
            <p className="text-[11px] text-content-muted">
              Duplicate titles within the same parent will be automatically skipped without error.
            </p>
          </div>
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
            disabled={computedTitles.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-on-primary bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm"
            onClick={handleAdd}
          >
            <Plus size={16} />
            <span>Add {computedTitles.length > 0 ? `${totalCreated} Nodes` : 'Nodes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
