import type { GoalNode, Task } from '../types';
import { todayISO } from './dates';
import { endpointDone, isBacklogTask, isOpenBacklogTask, isTaskComplete, rollupPct } from './goalTree';
import { currentStage } from './goalPace';
import { getNotificationPreferences } from './notifications';

/*
 * The morning briefing's text: what the day holds, the goal's countdown and an
 * honest pace, the streak. Loaded when the briefing is scheduled or previewed,
 * so none of it is in the app's first load.
 */

export function getDaysRemaining(endDate: string, today = todayISO()): number {
  const [ey, em, ed] = endDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const endUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((endUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the deadline for a root goal. If node.endDate is set, it takes precedence.
 * Otherwise, checks descendant nodes for the latest uncompleted deadline.
 */
export function getGoalEndDate(node: GoalNode): string | undefined {
  if (node.endDate) return node.endDate;
  let latestEnd: string | undefined;
  const walk = (children: GoalNode[]) => {
    for (const child of children) {
      if (!child.completed && child.endDate) {
        if (!latestEnd || child.endDate > latestEnd) {
          latestEnd = child.endDate;
        }
      }
      if (child.children?.length) {
        walk(child.children);
      }
    }
  };
  if (node.children?.length) {
    walk(node.children);
  }
  return latestEnd;
}

export interface BriefingData {
  todayTasksCount: number;
  /** The first open task in Today's order. */
  firstTaskTitle?: string;
  openBacklogCount: number;
  /**
   * pct: how much of the goal is done; openTasks: its tasks with work left.
   * stage: the dated stage in progress (goalPace.ts), which sets the pace instead.
   */
  activeGoals: {
    id: string;
    title: string;
    daysLeft: number;
    pct?: number;
    openTasks?: number;
    stage?: { title: string; daysLeft: number; openTasks: number };
  }[];
  streakCount: number;
  streakBest: number;
  /** The day the briefing is for (YYYY-MM-DD). */
  date?: string;
}

/** Tasks under a goal that still have work left. */
function countOpenTasks(node: GoalNode): number {
  return node.children.reduce(
    (total, child) => total + (child.children.length === 0 ? (endpointDone(child) ? 0 : 1) : countOpenTasks(child)),
    0,
  );
}

/** Progress and open tasks of a goal, once it has anything planned in it, and its stage in progress. */
function goalProgress(node: GoalNode, today: string): Pick<BriefingData['activeGoals'][number], 'pct' | 'openTasks' | 'stage'> {
  if (node.children.length === 0) return {};
  const stage = currentStage(node, today);
  return {
    pct: rollupPct(node),
    openTasks: countOpenTasks(node),
    ...(stage?.endDate ? { stage: { title: stage.title, daysLeft: getDaysRemaining(stage.endDate.slice(0, 10), today), openTasks: countOpenTasks(stage) } } : {}),
  };
}

export function extractBriefingData(
  tasks: Task[],
  goals: GoalNode[],
  streakCount = 0,
  streakBest = 0,
  today = todayISO(),
  selectedGoalId?: string,
): BriefingData {
  const todayTasks = tasks
    .filter((t) => (t.targetDate ? t.targetDate.slice(0, 10) === today : false) && !isBacklogTask(t, today) && !isTaskComplete(t))
    .sort((a, b) => a.order - b.order);
  const openBacklog = tasks.filter((t) => isOpenBacklogTask(t, today));

  const activeGoals: BriefingData['activeGoals'] = [];
  // Only consider root/top-level goals in the hierarchy (i.e. top-level goals in the goal tree, not child sub-nodes)
  for (const node of goals) {
    if (!node.completed) {
      const endDate = getGoalEndDate(node);
      if (endDate) {
        const daysLeft = getDaysRemaining(endDate, today);
        activeGoals.push({ id: node.id, title: node.title, daysLeft, ...goalProgress(node, today) });
      } else if (selectedGoalId && node.id === selectedGoalId) {
        // User explicitly chose this goal, preserve it even if no deadline is specified
        activeGoals.push({ id: node.id, title: node.title, daysLeft: Number.NaN, ...goalProgress(node, today) });
      }
    }
  }

  activeGoals.sort((a, b) => {
    if (Number.isNaN(a.daysLeft)) return 1;
    if (Number.isNaN(b.daysLeft)) return -1;
    return a.daysLeft - b.daysLeft;
  });

  if (selectedGoalId && selectedGoalId !== 'auto') {
    const selectedIdx = activeGoals.findIndex((g) => g.id === selectedGoalId);
    if (selectedIdx > -1) {
      const [selected] = activeGoals.splice(selectedIdx, 1);
      activeGoals.unshift(selected);
    }
  }

  return {
    todayTasksCount: todayTasks.length,
    firstTaskTitle: todayTasks[0]?.title,
    openBacklogCount: openBacklog.length,
    activeGoals,
    streakCount,
    streakBest,
    date: today,
  };
}

/** Keeps a name short enough for one notification line. */
function clipName(text: string, max = 44): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** "about 3 tasks a day", "a task a day" or "a task every 4 days". */
function paceWords(open: number, days: number): string {
  const perDay = open / days;
  if (perDay > 1) return `about ${Math.ceil(perDay)} tasks a day`;
  const every = Math.floor(days / open);
  return every <= 1 ? 'a task a day' : `a task every ${every} days`;
}

/**
 * How much of the goal is done and an honest pace: for the dated stage in
 * progress when there is one, else for what is planned so far. Goals planned a
 * stage at a time would otherwise get an easy pace that leaves out the stages
 * not planned yet.
 */
function goalPaceLine(goal: BriefingData['activeGoals'][number]): string | null {
  if (goal.pct === undefined) return null;
  const done = `📈 ${goal.pct}% done`;
  const stage = goal.stage;
  if (stage) {
    const name = clipName(stage.title, 24);
    const ends = stage.daysLeft === 0 ? 'ends today' : stage.daysLeft === 1 ? 'ends tomorrow' : `ends in ${stage.daysLeft} days`;
    if (!stage.openTasks) return `${done} · ${name} ${ends}`;
    return `${done} · ${name} ${ends} · ${paceWords(stage.openTasks, Math.max(1, stage.daysLeft))} keeps it on track`;
  }
  const open = goal.openTasks ?? 0;
  if (!open || !(goal.daysLeft > 0)) return done;
  return `${done} · ${paceWords(open, goal.daysLeft)} for what's planned so far`;
}

/** "Wed, 15 Oct" for the day the briefing is for. */
function briefingDateLabel(date?: string): string | null {
  const [y, m, d] = (date ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function buildMorningBriefingContent(
  data: BriefingData,
  prefs = getNotificationPreferences().morningBriefing,
): { title: string; body: string; largeBody?: string; summaryText?: string } {
  const parts: string[] = [];
  let title = 'Good morning ☀️';
  let goalLine: string | null = null;

  // The goal countdown is the headline, so it shows even when collapsed.
  if (prefs.includeGoals && data.activeGoals.length > 0) {
    const selectedId = prefs.selectedGoalId;
    const topGoal =
      selectedId && selectedId !== 'auto'
        ? (data.activeGoals.find((g) => g.id === selectedId) ?? data.activeGoals[0])
        : data.activeGoals[0];

    if (topGoal) {
      const name = clipName(topGoal.title, 40);
      const days = topGoal.daysLeft;
      if (Number.isNaN(days)) title = `🎯 ${name}`;
      else if (days > 1) title = `🎯 ${days} days to ${name}`;
      else if (days === 1) title = `🎯 ${name} is due tomorrow`;
      else if (days === 0) title = `🎯 ${name} is due today`;
      else title = `⏰ ${name} is ${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
      goalLine = goalPaceLine(topGoal);
    }
  }

  // Today's plan, led by the first task.
  if (prefs.includeTodayPlan) {
    const count = data.todayTasksCount;
    if (count > 0 && data.firstTaskTitle) {
      parts.push(`📌 First up: ${clipName(data.firstTaskTitle)}${count > 1 ? ` · ${count - 1} more planned` : ''}`);
    } else if (count > 0) {
      parts.push(`📌 ${count} task${count === 1 ? '' : 's'} planned today`);
    } else {
      parts.push('🗓️ Nothing planned yet · pick 1–2 tasks from Goals');
    }
  }

  if (goalLine) parts.push(goalLine);

  if (prefs.includeBacklog && data.openBacklogCount > 0) {
    parts.push(`🗂️ ${data.openBacklogCount} waiting in backlog · clear one first`);
  }

  if (prefs.includeStreak) {
    const streak = data.streakCount;
    const best = data.streakBest;
    if (streak > 0) {
      const gap = best - streak + 1;
      if (streak >= best && streak > 1) parts.push(`🔥 ${streak}-day streak · your best yet`);
      else if (streak < best && gap <= 5) parts.push(`🔥 ${streak}-day streak · ${gap} more day${gap === 1 ? '' : 's'} to beat your best (${best})`);
      else parts.push(`🔥 ${streak}-day streak · keep it going`);
    } else if (best > 0) {
      parts.push('🔥 Finish a task today to start a new streak');
    }
  }

  // One fact per line, each with its own mark; the header carries the date.
  const fullText = parts.length > 0 ? parts.join('\n') : 'Open YouDO to plan your day.';
  const dateLabel = briefingDateLabel(data.date);
  const greeting = title.startsWith('Good morning');
  const summaryText = greeting ? (dateLabel ?? 'Morning briefing') : dateLabel ? `Good morning · ${dateLabel}` : 'Good morning';

  return { title, body: fullText, largeBody: fullText, summaryText };
}
