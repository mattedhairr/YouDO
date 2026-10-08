import { ChevronDown, ChevronRight, Target, Folder, ListChecks, Square, CheckSquare2 } from 'lucide-react';
import type { GoalNode } from '../../types';
import type { BlueprintStudioController } from './blueprintStudioState';

export function StudioTree({ controller }: { controller: BlueprintStudioController }) {
  const { draftGoals, selectedIds, expandedIds, toggleSelect, toggleExpand } = controller;

  if (draftGoals.length === 0) {
    return <div className="p-4 text-center text-sm text-gray-500">No goals found.</div>;
  }

  return (
    <div className="flex flex-col py-2">
      {draftGoals.map((goal) => (
        <TreeNode
          key={goal.id}
          node={goal}
          depth={0}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onSelect={toggleSelect}
          onExpand={toggleExpand}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedIds,
  expandedIds,
  onSelect,
  onExpand,
}: {
  node: GoalNode;
  depth: number;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  const isSelected = selectedIds.has(node.id);
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  
  const icon = node.kind === 'goal' 
    ? <Target size={16} /> 
    : hasChildren 
      ? <Folder size={16} /> 
      : <ListChecks size={16} />;

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded-lg cursor-pointer ${isSelected ? 'bg-blue-50/50' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          className="p-1 -ml-1 text-gray-400 hover:text-gray-700"
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation();
            onExpand(node.id);
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <button
          type="button"
          className="text-gray-400 hover:text-blue-500"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id);
          }}
        >
          {isSelected ? <CheckSquare2 size={16} className="text-blue-500" /> : <Square size={16} />}
        </button>

        <div className="text-gray-400">{icon}</div>
        
        <span className="text-sm font-medium text-gray-700 truncate">{node.title}</span>
        
        {node.startDate && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-auto">
            {node.startDate}
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
