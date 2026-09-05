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
  /** date before it was moved to today from the backlog */
  originalTargetDate?: string | null;
  /** dates this task was natively scheduled for but failed on */
  pastFailedNativeDates?: string[];
  /** dates this task was a backlog task but failed on */
  pastFailedBacklogDates?: string[];
  /** Short-lived handoff note for resuming an unfinished task. Cleared on completion. */
  resumeNote?: string;
}

export interface SessionStopOutcome {
  completed: boolean | 'partial';
  completedStepIndices: number[];
  /** Saved on the unfinished task only; never copied into session history. */
  resumeNote?: string;
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

export type View = 'tasks' | 'goals' | 'calendar' | 'board';

/* ─── Session Timer Types ─────────────────────────────────────────────────── */

export interface SessionPause {
  start: number;            // Date.now() when paused
  end?: number;             // Date.now() when resumed; undefined if still paused
  wallClockStart?: string;  // e.g. "6:30 PM"
  wallClockEnd?: string;    // e.g. "7:10 PM"
  durationMs?: number;      // pause duration in ms
}

/** A completed session record saved to history */
export interface TaskSession {
  id: string;
  taskId: string;
  startTime: number;             // Date.now() when session was started
  endTime: number;               // Date.now() when session was stopped
  pausedDuration: number;        // total milliseconds paused
  pauses: SessionPause[];
  netFocusMs: number;            // (endTime - startTime) - pausedDuration
  wallClockStart: string;        // e.g. "8:12 AM"
  wallClockEnd: string;          // e.g. "9:04 AM"
  completed: boolean | 'partial';
  completedStepIndices: number[]; // indices into task.steps[] marked done at stop
  goalNodeId?: string;           // link to Goal Blueprint node
  /** true when step/task was marked done outside a focus session */
  manual?: boolean;
}

/** The single currently active (live) session */
export interface ActiveSession {
  taskId: string;
  startTime: number;             // Date.now() when started
  pausedDuration: number;        // accumulated ms paused so far
  isPaused: boolean;
  pauseStart?: number;           // Date.now() when last paused (if currently paused)
  lastHeartbeat: number;         // updated every 30s; used for crash recovery
  pauses: SessionPause[];
  wallClockStart: string;        // "8:12 AM"
  /** Set when user resumes an interrupted session; 4h auto-pause is measured from this, not phone-off time */
  returnedAt?: number;
}
