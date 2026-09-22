import type { GoalNode } from '../types';
import { todayISO } from './dates';
import { uid } from './ids';

export const AI_PLAN_MAX_BYTES = 500 * 1024;
export const AI_PLAN_MAX_NODES = 1_000;
export const AI_PLAN_MAX_DEPTH = 20;
export const AI_PLAN_MAX_STEPS = 8;

export interface BuildPlanAnswers {
  examName: string;
  targetDate: string;
  timeRemaining: string;
  dailyHours: number;
  dailyMinutes: number;
  daysPerWeek: number;
  currentStatus: string;
  syllabusResources: string;
  constraintsPreferences: string;
  additionalInstructions: string;
}

export interface GeneratedBlueprintNode {
  kind: 'goal' | 'node';
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  children: GeneratedBlueprintNode[];
  steps?: string[];
}

export interface GeneratedBlueprintPayload {
  tasks: [];
  goals: [GeneratedBlueprintNode];
}

export interface GeneratedBlueprintSummary {
  goalName: string;
  nodes: number;
  branches: number;
  endpoints: number;
  checklistSteps: number;
  startDate?: string;
  endDate?: string;
}

export type GeneratedBlueprintParseResult =
  | { ok: true; payload: GeneratedBlueprintPayload; summary: GeneratedBlueprintSummary }
  | { ok: false; error: string };

const PROMPT_TEMPLATE = `You are designing a practical exam-preparation plan for YouDO, a universal goal-tree planner.

USER CONTEXT
- Today: {{current_date}}
- Exam or goal: {{exam_name}}
- Target date: {{target_date}}
- Time remaining: {{time_remaining}}
- Available study time: {{daily_time}}, {{days_per_week}} day(s) per week
- Current preparation status: {{current_status}}
- Syllabus, subjects, and resources: {{syllabus_resources}}
- Constraints and planning preferences: {{constraints_preferences}}
- Additional instructions: {{additional_instructions}}

PLANNING INSTRUCTIONS
1. Create one root goal for the exam or outcome. Choose a natural tree structure for this preparation instead of forcing fixed Phase, Subject, Chapter, or Task layers.
2. Break the work into useful branches and actionable endpoint tasks. Include foundation, practice, revision, tests, and mock exams only where they fit the user's situation and available time.
3. Use startDate and endDate on meaningful branches when the supplied timeline supports them. Dates must use YYYY-MM-DD and must not precede {{current_date}}.
4. Endpoint tasks may contain up to 8 short checklist steps. Nodes with children must not contain steps.
5. Keep the plan realistic for the stated daily time. Prefer a clear plan the user can refine over an enormous list.
6. Do not invent official exam dates, syllabus facts, marks, or weightages. If essential information is missing or uncertain, keep that part general and describe what the user should confirm.

OUTPUT CONTRACT
Return only valid JSON. Do not use Markdown fences, commentary, or text before or after the JSON.
Use exactly this top-level shape:
{
  "tasks": [],
  "goals": [
    {
      "kind": "goal",
      "title": "{{exam_name}}",
      "description": "Optional useful context",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "children": []
    }
  ]
}

The goals array must contain exactly one root. Every descendant must use kind "node". Every node must contain kind, title, and children. Optional fields are description, startDate, endDate, and steps. Use steps only on endpoints.
Do not output IDs, createdAt, completed, stepDone, todayTaskId, pinned, session history, schedules, settings, account data, or any other fields.`;

const textOrFallback = (value: string, fallback = 'Not provided') => value.trim() || fallback;

export function validateBuildPlanAnswers(answers: BuildPlanAnswers): string | null {
  if (!answers.examName.trim()) return 'Name the exam or goal.';
  if (!answers.targetDate && !answers.timeRemaining.trim()) return 'Add a target date or describe the time remaining.';
  if (!Number.isInteger(answers.dailyHours) || answers.dailyHours < 0 || answers.dailyHours > 23) return 'Study hours must be between 0 and 23.';
  if (!Number.isInteger(answers.dailyMinutes) || answers.dailyMinutes < 0 || answers.dailyMinutes > 59) return 'Study minutes must be between 0 and 59.';
  if (answers.dailyHours === 0 && answers.dailyMinutes === 0) return 'Add the time available on each study day.';
  if (!Number.isInteger(answers.daysPerWeek) || answers.daysPerWeek < 1 || answers.daysPerWeek > 7) return 'Study days must be between 1 and 7.';
  if (!answers.currentStatus.trim()) return 'Describe the current preparation status.';
  if (answers.targetDate && !isISODate(answers.targetDate)) return 'Use a valid target date.';
  return null;
}

export function buildSetupPrompt(answers: BuildPlanAnswers, currentDate = todayISO()): string {
  const error = validateBuildPlanAnswers(answers);
  if (error) throw new Error(error);
  const timeParts = [
    answers.dailyHours ? `${answers.dailyHours} hour${answers.dailyHours === 1 ? '' : 's'}` : '',
    answers.dailyMinutes ? `${answers.dailyMinutes} minute${answers.dailyMinutes === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const values: Record<string, string> = {
    current_date: currentDate,
    exam_name: answers.examName.trim(),
    target_date: answers.targetDate || 'Not provided',
    time_remaining: textOrFallback(answers.timeRemaining),
    daily_time: timeParts.join(' ') || 'Not provided',
    days_per_week: String(answers.daysPerWeek),
    current_status: answers.currentStatus.trim(),
    syllabus_resources: textOrFallback(answers.syllabusResources),
    constraints_preferences: textOrFallback(answers.constraintsPreferences),
    additional_instructions: textOrFallback(answers.additionalInstructions),
  };
  return PROMPT_TEMPLATE.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function stripSingleFence(value: string): string {
  const trimmed = value.trim().replace(/^\uFEFF/, '');
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function pathLabel(parts: string[]): string {
  return parts.filter(Boolean).join(' / ') || 'Plan';
}

export function parseGeneratedBlueprint(text: string): GeneratedBlueprintParseResult {
  if (new Blob([text]).size > AI_PLAN_MAX_BYTES) return { ok: false, error: 'The plan is larger than 500 KB.' };
  let decoded: unknown;
  try {
    decoded = JSON.parse(stripSingleFence(text));
  } catch {
    return { ok: false, error: 'Paste one valid JSON object without extra explanation.' };
  }
  const root = asRecord(decoded);
  if (!root) return { ok: false, error: 'The AI response must be one JSON object.' };
  const topKeys = Object.keys(root);
  if (topKeys.some((key) => key !== 'tasks' && key !== 'goals') || !('tasks' in root) || !('goals' in root)) {
    return { ok: false, error: 'The JSON must contain only tasks and goals.' };
  }
  if (!Array.isArray(root.tasks) || root.tasks.length > 0) return { ok: false, error: 'tasks must be an empty array.' };
  if (!Array.isArray(root.goals) || root.goals.length !== 1) return { ok: false, error: 'goals must contain exactly one root goal.' };

  let nodeCount = 0;
  let branches = 0;
  let endpoints = 0;
  let checklistSteps = 0;
  let earliest = '';
  let latest = '';
  const allowed = new Set(['kind', 'title', 'description', 'startDate', 'endDate', 'children', 'steps']);

  const validateNode = (value: unknown, depth: number, parents: string[]): { node?: GeneratedBlueprintNode; error?: string } => {
    const record = asRecord(value);
    const location = pathLabel(parents);
    if (!record) return { error: `${location}: every item must be an object.` };
    const expectedKind = depth === 1 ? 'goal' : 'node';
    if (record.kind !== expectedKind) return { error: `${location}: kind must be "${expectedKind}".` };
    if (typeof record.title !== 'string' || !record.title.trim()) return { error: `${location}: add a non-empty title.` };
    const title = record.title.trim().replace(/\s+/g, ' ');
    const nextPath = [...parents, title];
    const nextLocation = pathLabel(nextPath);
    if (Object.keys(record).some((key) => !allowed.has(key))) return { error: `${nextLocation}: remove fields that are not part of the plan schema.` };
    if (!Array.isArray(record.children)) return { error: `${nextLocation}: children must be an array.` };
    if (depth > AI_PLAN_MAX_DEPTH) return { error: `${nextLocation}: the plan is deeper than ${AI_PLAN_MAX_DEPTH} levels.` };
    nodeCount += 1;
    if (nodeCount > AI_PLAN_MAX_NODES) return { error: `The plan contains more than ${AI_PLAN_MAX_NODES.toLocaleString()} items.` };

    for (const key of ['description', 'startDate', 'endDate'] as const) {
      if (key in record && typeof record[key] !== 'string') return { error: `${nextLocation}: ${key} must be text.` };
    }
    const startDate = typeof record.startDate === 'string' && record.startDate ? record.startDate : undefined;
    const endDate = typeof record.endDate === 'string' && record.endDate ? record.endDate : undefined;
    if (startDate && !isISODate(startDate)) return { error: `${nextLocation}: startDate must use YYYY-MM-DD.` };
    if (endDate && !isISODate(endDate)) return { error: `${nextLocation}: endDate must use YYYY-MM-DD.` };
    if (startDate && endDate && startDate > endDate) return { error: `${nextLocation}: end date is before start date.` };
    if (startDate && (!earliest || startDate < earliest)) earliest = startDate;
    if (endDate && (!latest || endDate > latest)) latest = endDate;

    const siblingNames = new Set<string>();
    const children: GeneratedBlueprintNode[] = [];
    for (const child of record.children) {
      const result = validateNode(child, depth + 1, nextPath);
      if (result.error || !result.node) return result;
      const key = result.node.title.toLocaleLowerCase();
      if (siblingNames.has(key)) return { error: `${nextLocation}: duplicate child title "${result.node.title}".` };
      siblingNames.add(key);
      children.push(result.node);
    }

    let steps: string[] | undefined;
    if ('steps' in record) {
      if (!Array.isArray(record.steps) || record.steps.some((step) => typeof step !== 'string' || !step.trim())) {
        return { error: `${nextLocation}: steps must be non-empty text.` };
      }
      if (record.steps.length > AI_PLAN_MAX_STEPS) return { error: `${nextLocation}: use at most ${AI_PLAN_MAX_STEPS} checklist steps.` };
      if (children.length > 0) return { error: `${nextLocation}: branches with children cannot also contain steps.` };
      steps = record.steps.map((step) => (step as string).trim().replace(/\s+/g, ' '));
      const unique = new Set(steps.map((step) => step.toLocaleLowerCase()));
      if (unique.size !== steps.length) return { error: `${nextLocation}: checklist steps must be unique.` };
      checklistSteps += steps.length;
    }
    if (children.length > 0) branches += 1;
    else endpoints += 1;
    return {
      node: {
        kind: expectedKind,
        title,
        ...(typeof record.description === 'string' && record.description.trim() ? { description: record.description.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        children,
        ...(steps ? { steps } : {}),
      },
    };
  };

  const result = validateNode(root.goals[0], 1, []);
  if (result.error || !result.node) return { ok: false, error: result.error ?? 'The plan could not be read.' };
  const payload: GeneratedBlueprintPayload = { tasks: [], goals: [result.node] };
  return {
    ok: true,
    payload,
    summary: {
      goalName: result.node.title,
      nodes: nodeCount,
      branches,
      endpoints,
      checklistSteps,
      ...(earliest ? { startDate: earliest } : {}),
      ...(latest ? { endDate: latest } : {}),
    },
  };
}

export function materializeGeneratedBlueprint(payload: GeneratedBlueprintPayload, now = Date.now()): GoalNode[] {
  let offset = 0;
  const materialize = (node: GeneratedBlueprintNode, root: boolean): GoalNode => {
    const createdAt = now + offset++;
    const children = node.children.map((child) => materialize(child, false));
    const steps = children.length === 0 && node.steps ? [...node.steps] : undefined;
    return {
      id: uid('goal'),
      kind: root ? 'goal' : 'node',
      title: node.title,
      ...(node.description ? { description: node.description } : {}),
      ...(node.startDate ? { startDate: node.startDate } : {}),
      ...(node.endDate ? { endDate: node.endDate } : {}),
      children,
      ...(steps ? { steps, stepDone: steps.map(() => false) } : {}),
      completed: false,
      todayTaskId: null,
      pinned: false,
      createdAt,
    };
  };
  return payload.goals.map((goal) => materialize(goal, true));
}

export type AppendGeneratedBlueprintResult =
  | { ok: true; goals: GoalNode[] }
  | { ok: false; error: string };

export function appendGeneratedBlueprint(
  existing: GoalNode[],
  payload: GeneratedBlueprintPayload,
  now = Date.now(),
): AppendGeneratedBlueprintResult {
  const root = payload.goals[0];
  const normalized = root.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (existing.some((goal) => goal.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalized)) {
    return { ok: false, error: `A goal named “${root.title}” already exists. Rename one before adding this plan.` };
  }
  return { ok: true, goals: [...existing, ...materializeGeneratedBlueprint(payload, now)] };
}
