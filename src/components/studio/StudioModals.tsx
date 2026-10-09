import type { BlueprintStudioController } from './blueprintStudioState';
import { StudioNodeExpansionModal } from './StudioNodeExpansionModal';
import { StudioBulkAddModal } from './StudioBulkAddModal';
import { StudioBulkStepDiffModal } from './StudioBulkStepDiffModal';
import { StudioDateModal } from './StudioDateModal';

export interface StudioModalsProps {
  controller: BlueprintStudioController;
}

export function StudioModals({ controller }: StudioModalsProps) {
  const { activeModal, targetNodeIds } = controller;

  if (activeModal === 'none' || targetNodeIds.length === 0) return null;

  return (
    <>
      {activeModal === 'node_expansion' && (
        <StudioNodeExpansionModal controller={controller} />
      )}
      {activeModal === 'bulk_add_inside' && (
        <StudioBulkAddModal controller={controller} />
      )}
      {activeModal === 'bulk_step_diff' && (
        <StudioBulkStepDiffModal controller={controller} />
      )}
      {activeModal === 'date_picker' && (
        <StudioDateModal controller={controller} />
      )}
    </>
  );
}
