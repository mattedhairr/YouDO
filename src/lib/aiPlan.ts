import type { GoalNode } from '../types';
import { todayISO } from './dates';
import { uid } from './ids';
import { readPlanJSON } from './aiPlanInput';
import { composePlanPrompt, buildMasterPlanningPrompt as createMasterPlanningPrompt } from './aiPlanPrompt';

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
  preparationStage?: string;
  strongTopics?: string;
  weakTopics?: string;
  resources?: string;
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
  | { ok: true; payload: GeneratedBlueprintPayload; summary: GeneratedBlueprintSummary; notes: string[] }
  | { ok: false; error: string };

export function validateBuildPlanAnswers(answers: BuildPlanAnswers, currentDate = todayISO()): string | null {
  return validateBuildPlanSection(answers, 0, currentDate) ?? validateBuildPlanSection(answers, 1, currentDate);
}

export function validateBuildPlanSection(answers: BuildPlanAnswers, section: 0 | 1 | 2, currentDate = todayISO()): string | null {
  if (section === 2) return null;
  if (section === 0) {
    if (!answers.examName.trim()) return 'Name the exam or goal.';
    if (!answers.targetDate && !answers.timeRemaining.trim()) return 'Add a target date or describe the time remaining.';
    if (answers.targetDate && !isISODate(answers.targetDate)) return 'Use a valid target date.';
    if (answers.targetDate && answers.targetDate < currentDate) return 'Choose today or a future target date.';
    return null;
  }
  if (!Number.isInteger(answers.dailyHours) || answers.dailyHours < 0 || answers.dailyHours > 23) return 'Study hours must be between 0 and 23.';
  if (!Number.isInteger(answers.dailyMinutes) || answers.dailyMinutes < 0 || answers.dailyMinutes > 59) return 'Study minutes must be between 0 and 59.';
  if (answers.dailyHours === 0 && answers.dailyMinutes === 0) return 'Add the time available on each study day.';
  if (!Number.isInteger(answers.daysPerWeek) || answers.daysPerWeek < 1 || answers.daysPerWeek > 7) return 'Study days must be between 1 and 7.';
  if (!answers.currentStatus.trim() && !answers.preparationStage?.trim()) return 'Describe the current preparation status.';
  return null;
}

export function buildSetupPrompt(answers: BuildPlanAnswers, currentDate = todayISO()): string {
  const error = validateBuildPlanAnswers(answers, currentDate);
  if (error) throw new Error(error);
  return composePlanPrompt(answers, currentDate);
}

export function buildMasterPlanningPrompt(currentDate = todayISO()): string {
  return createMasterPlanningPrompt(currentDate);
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

function pathLabel(parts: string[]): string {
  return parts.filter(Boolean).join(' / ') || 'Plan';
}

export function parseGeneratedBlueprint(text: string, context?: { today?: string; targetDate?: string }): GeneratedBlueprintParseResult {
  if (new Blob([text]).size > AI_PLAN_MAX_BYTES) return { ok: false, error: 'The plan is larger than 500 KB.' };
  const extracted = readPlanJSON(text);
  if (extracted.error) return { ok: false, error: extracted.error };
  const decoded = extracted.value;
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
  let hasPastDates = false;
  let exceedsTarget = false;
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
    for (const date of [startDate, endDate]) {
      if (date && context?.today && date < context.today) hasPastDates = true;
      if (date && context?.targetDate && date > context.targetDate) exceedsTarget = true;
    }

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
  if (result.node.children.length === 0) return { ok: false, error: 'The plan contains only a goal title. Ask the AI to include actionable tasks inside children.' };
  const notes = [...extracted.notes];
  if (hasPastDates) notes.push('Some work is dated in the past. Review the dates before adding this plan.');
  if (exceedsTarget) notes.push('Some work is dated after your target date. Ask the AI to revise the timeline or review those dates.');
  if (nodeCount > 120) notes.push('This is a large plan. Consider asking for fewer tasks and clearer milestones.');
  const checkDates = (node: GeneratedBlueprintNode, start?: string, end?: string): boolean => {
    if ((start && ((node.startDate && node.startDate < start) || (node.endDate && node.endDate < start))) ||
        (end && ((node.startDate && node.startDate > end) || (node.endDate && node.endDate > end)))) return true;
    return node.children.some(child => checkDates(child, node.startDate || start, node.endDate || end));
  };
  if (checkDates(result.node)) notes.push('Some task dates fall outside their parent milestone. Review the timeline.');
  const payload: GeneratedBlueprintPayload = { tasks: [], goals: [result.node] };
  return {
    ok: true,
    payload,
    notes,
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
