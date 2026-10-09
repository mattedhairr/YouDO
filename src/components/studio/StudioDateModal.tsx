import { useState, useMemo, useEffect } from 'react';
import { Calendar, X, AlertCircle } from 'lucide-react';
import type { BlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';
import { todayISO, tomorrowISO, shiftLocalISO } from '../../lib/dates';
import { isValidISODate } from '../../lib/blueprintStudio';

export interface StudioDateModalProps {
  controller: BlueprintStudioController;
}

export function StudioDateModal({ controller }: StudioDateModalProps) {
  const { targetNodeIds, draftGoals, closeModal, setDates } = controller;

  const totalTargets = targetNodeIds.length;

  // Pre-fill if exactly 1 node is targeted
  const initialDates = useMemo(() => {
    if (targetNodeIds.length === 1) {
      const node = findGoal(draftGoals, targetNodeIds[0]);
      if (node) {
        return {
          start: node.startDate || '',
          end: node.endDate || '',
        };
      }
    }
    return { start: '', end: '' };
  }, [targetNodeIds, draftGoals]);

  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

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

  // Quick preset calculations
  const applyPresetToday = () => {
    const t = todayISO();
    setStartDate(t);
    setEndDate(t);
  };

  const applyPresetTomorrow = () => {
    const tm = tomorrowISO();
    setStartDate(tm);
    setEndDate(tm);
  };

  const applyPresetWeekend = () => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sunday, 6 is Saturday
    const daysUntilSat = (6 - day + 7) % 7 || 7;
    const sat = shiftLocalISO(todayISO(), daysUntilSat);
    const sun = shiftLocalISO(sat, 1);
    setStartDate(sat);
    setEndDate(sun);
  };

  const applyPresetNextWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilNextMon = (1 - day + 7) % 7 || 7;
    const nextMon = shiftLocalISO(todayISO(), daysUntilNextMon);
    const nextSun = shiftLocalISO(nextMon, 6);
    setStartDate(nextMon);
    setEndDate(nextSun);
  };

  const applyPresetClear = () => {
    setStartDate('');
    setEndDate('');
  };

  // Inline Validation
  const validationError = useMemo(() => {
    const s = startDate.trim();
    const e = endDate.trim();

    if (s && !isValidISODate(s)) {
      return `Target date "${s}" is not a valid date.`;
    }
    if (e && !isValidISODate(e)) {
      return `Deadline date "${e}" is not a valid date.`;
    }
    if (s && e && s > e) {
      return `Target date (${s}) cannot be after deadline (${e}).`;
    }

    return null;
  }, [startDate, endDate]);

  const isValid = validationError === null;

  const handleSave = () => {
    if (!isValid) return;

    if (!startDate.trim() && !endDate.trim()) {
      setDates(targetNodeIds, { clearAll: true });
    } else {
      setDates(targetNodeIds, {
        startDate: startDate.trim() || undefined,
        endDate: endDate.trim() || undefined,
      });
    }
    closeModal();
  };

  const handleClearAllDates = () => {
    setDates(targetNodeIds, { clearAll: true });
    closeModal();
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
        aria-labelledby="date-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface">
          <div>
            <h3 id="date-modal-title" className="text-sm sm:text-base font-semibold text-content-primary">
              Set Dates
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Applying to {totalTargets} selected item{totalTargets > 1 ? 's' : ''}
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
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-content-secondary">
              Quick Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border-subtle hover:bg-elevated hover:text-content-primary transition-colors text-content-secondary"
                onClick={applyPresetToday}
              >
                Today
              </button>
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border-subtle hover:bg-elevated hover:text-content-primary transition-colors text-content-secondary"
                onClick={applyPresetTomorrow}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border-subtle hover:bg-elevated hover:text-content-primary transition-colors text-content-secondary"
                onClick={applyPresetWeekend}
              >
                This Weekend
              </button>
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border-subtle hover:bg-elevated hover:text-content-primary transition-colors text-content-secondary"
                onClick={applyPresetNextWeek}
              >
                Next Week
              </button>
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border-subtle hover:bg-error-soft hover:text-error transition-colors text-content-muted"
                onClick={applyPresetClear}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Date Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-content-secondary">
                Target Date (Start)
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-content-secondary">
                Deadline (End)
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm bg-base border border-border-subtle rounded-xl text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Inline Validation Alert */}
          {validationError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-error-soft border border-error/30 text-xs text-error flex items-center gap-2"
            >
              <AlertCircle size={15} className="shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border-subtle bg-elevated/50 flex items-center justify-between">
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-medium text-error hover:bg-error-soft rounded-lg transition-colors"
            onClick={handleClearAllDates}
          >
            Clear Dates
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              className="px-3.5 py-2 text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-elevated rounded-xl transition-colors"
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isValid}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-on-primary bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm"
              onClick={handleSave}
            >
              <Calendar size={16} />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
