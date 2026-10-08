import { useRef } from 'react';
import type { GoalNode } from '../types';
import type { GoalTreeChangeResult } from '../store';
import { useBlueprintStudioState, BlueprintStudioController } from './studio/blueprintStudioState';
import { StudioTree } from './studio/StudioTree';
import { StudioActionBar } from './studio/StudioActionBar';
import { StudioModals } from './studio/StudioModals';
import Overlay from './Overlay';
import './studio/studio.css';
import { Undo2, Redo2, Check, ArrowLeft } from 'lucide-react';

export interface BlueprintStudioProps {
  open: boolean;
  goals: GoalNode[];
  initialPathIds?: string[];
  activeGoalNodeId?: string;
  onClose: () => void;
  onCommit: (baseGoals: GoalNode[], nextGoals: GoalNode[], summary: string) => GoalTreeChangeResult;
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
    <Overlay open={open} onClose={onClose} align="full" scrim={false}>
      <StudioContent
        goals={goals}
        initialPathIds={initialPathIds}
        activeGoalNodeId={activeGoalNodeId}
        onClose={onClose}
        onCommit={onCommit}
      />
    </Overlay>
  );
}

function StudioContent({
  goals,
  initialPathIds,
  activeGoalNodeId,
  onClose,
  onCommit,
}: Omit<BlueprintStudioProps, 'open'>) {
  const controller = useBlueprintStudioState({
    goals,
    initialPathIds,
    activeGoalNodeId,
  });

  const handleCommit = () => {
    onCommit(controller.baseGoals, controller.draftGoals, controller.lastActionDescription || 'Updated studio items');
    onClose();
  };

  return (
    <div className="studio">
      <div className="studio-workspace">
        <header className="studio-header">
          <button type="button" className="studio-icon-button" onClick={onClose} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <div className="studio-header-title">
            <h1>Blueprint Studio</h1>
          </div>
          <button
            type="button"
            className="studio-icon-button"
            disabled={!controller.canUndo}
            onClick={() => controller.undo()}
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="studio-icon-button"
            disabled={!controller.canRedo}
            onClick={() => controller.redo()}
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="studio-save"
            disabled={!controller.isDirty}
            onClick={handleCommit}
          >
            <Check size={16} /> Save Changes
          </button>
        </header>

        <div className="studio-scroll">
          <StudioTree controller={controller} />
        </div>

        <StudioActionBar controller={controller} />
        <StudioModals controller={controller} />
      </div>
    </div>
  );
}
