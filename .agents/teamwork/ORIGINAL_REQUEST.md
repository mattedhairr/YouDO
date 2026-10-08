# Original User Request

## Initial Request — 2026-10-08T05:24:25Z

# Teamwork Project Prompt — Draft

Rebuild the foundational UI/UX of Blueprint Studio from scratch to create a simple, streamlined, and flexible goal tree editor. Focus on essential core features first, including robust bulk-editing capabilities.

Working directory: d:\Production\Projects\YouDO
Integrity mode: development

## Requirements

### R1. Flexible Node Expansion
Users must have the choice when expanding a node: they can either add checklist steps (turning it into an executable task) OR add child nodes (turning it into a branch/folder). This should be explicit and user-driven.

### R2. Bulk "Add Inside"
Users must be able to select multiple nodes and add items inside all of them simultaneously. This should follow a similar UI/UX pattern to the existing bulk-add logic but be more intuitive and robust.

### R3. Bulk Step Editing (Diffing)
When multiple nodes are selected, users can edit their steps in bulk:
- **Adding:** New steps added in the bulk editor are added to all selected nodes. If a node already has that exact step, skip it (no duplicates).
- **Removing:** Steps deleted in the bulk editor are removed from all selected nodes. If a node doesn't have that step, skip it.

### R4. Bulk & Individual Date Changing
Users must be able to change target dates and deadlines for a single node, or select multiple nodes and apply the same date changes to all of them at once.

### R5. Soothing & Simple UI/UX
The interface must feel clean, soothing, and simple to use. Avoid overly complicated menus or cluttered layouts. The design language should remain unified and visually pleasing.

## Acceptance Criteria

### Functionality & Logic
- [ ] An independent agent-as-judge can verify that bulk-adding child nodes works correctly when multiple nodes are selected.
- [ ] An independent agent-as-judge can verify that bulk-adding/removing checklist steps correctly applies set-union/set-difference logic without creating duplicates or throwing errors for missing steps.
- [ ] A programmatic or manual test confirms that users can successfully bulk-edit dates across multiple selected items.
- [ ] The UI cleanly presents the choice between adding "steps" or "children" to a node without confusing restrictions.
