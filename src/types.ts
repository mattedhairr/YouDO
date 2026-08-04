export type Priority = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  targetDate: string | null; // ISO date (yyyy-mm-dd)
  deadline: string | null; // ISO datetime, hard deadline
  steps: string[]; // sub-step labels shown on the daily card
  progress: number; // 0..steps.length completed (within this card's slice)
  createdAt: number;
  order: number;
  /** id of the Goal Blueprint node this daily task mirrors, if any */
  goalNodeId?: string;
  /** indices into the master goal node's steps array that this card targets */
  stepSlice?: number[];
}

export type GoalKind = 'goal' | 'phase' | 'section' | 'task' | 'sub' | 'leaf';

export interface GoalNode {
  id: string;
  kind: GoalKind;
  title: string;
  description?: string;
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  /** ordered children for unlimited nesting */
  children: GoalNode[];
  /** for leaf/sub nodes: micro-progress step labels */
  steps?: string[];
  /** per-step completion state (parallel to steps); source of truth for leaf progress */
  stepDone?: boolean[];
  /** true when every step is done (or for stepless leaves, manually toggled) */
  completed?: boolean;
  /** id of the linked daily task, if currently pushed to Today */
  todayTaskId?: string | null;
  /** pinned/favorited for quick access */
  pinned?: boolean;
  createdAt: number;
}

export type View = 'tasks' | 'goals' | 'calendar';
