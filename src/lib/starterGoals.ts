import type { GoalNode } from '../types';
import { uid } from './ids';

/**
 * Starter plans for the welcome tour: a real goal the person keeps and edits,
 * with the exam's subjects as branches and a few chapters inside, each with
 * three small steps. No deadline: the person sets their exam date later.
 */
export type StarterExam = 'JEE' | 'NEET' | 'UPSC' | 'GATE' | 'CAT' | 'Boards' | 'Other';

export interface StarterChoice {
  exam: StarterExam;
  label: string;
  subjects: string;
}

export const STARTER_CHOICES: StarterChoice[] = [
  { exam: 'JEE', label: 'JEE', subjects: 'Physics · Chemistry · Maths' },
  { exam: 'NEET', label: 'NEET', subjects: 'Physics · Chemistry · Biology' },
  { exam: 'UPSC', label: 'UPSC', subjects: 'GS I–III · Essay · CSAT' },
  { exam: 'GATE', label: 'GATE', subjects: 'Maths · Aptitude · Core' },
  { exam: 'CAT', label: 'CAT', subjects: 'VARC · DILR · Quant' },
  { exam: 'Boards', label: 'Boards', subjects: 'Class 10 or 12' },
];

const STUDY_STEPS = ['Learn the concepts', 'Make short notes', 'Solve practice questions'];

const PLANS: Record<Exclude<StarterExam, 'Other'>, { title: string; subjects: [string, string[]][] }> = {
  JEE: { title: 'JEE preparation', subjects: [
    ['Physics', ['Kinematics', 'Laws of Motion']],
    ['Chemistry', ['Mole Concept', 'Atomic Structure']],
    ['Maths', ['Quadratic Equations', 'Limits and Continuity']],
  ] },
  NEET: { title: 'NEET preparation', subjects: [
    ['Physics', ['Kinematics', 'Laws of Motion']],
    ['Chemistry', ['Mole Concept', 'Chemical Bonding']],
    ['Biology', ['Cell: The Unit of Life', 'Human Physiology']],
  ] },
  UPSC: { title: 'UPSC CSE preparation', subjects: [
    ['GS Paper I', ['Modern History', 'Indian Geography']],
    ['GS Paper II', ['Indian Polity', 'Governance']],
    ['GS Paper III', ['Indian Economy', 'Environment']],
    ['Essay', ['Essay practice']],
    ['CSAT', ['Reading comprehension']],
  ] },
  GATE: { title: 'GATE preparation', subjects: [
    ['Engineering Mathematics', ['Linear Algebra', 'Calculus']],
    ['General Aptitude', ['Verbal ability', 'Quantitative aptitude']],
    ['Core subjects', ['Your first core subject']],
  ] },
  CAT: { title: 'CAT preparation', subjects: [
    ['VARC', ['Reading Comprehension', 'Para Jumbles']],
    ['DILR', ['Arrangements', 'Data Interpretation sets']],
    ['Quant', ['Arithmetic', 'Algebra']],
  ] },
  Boards: { title: 'Board exam preparation', subjects: [
    ['Mathematics', ['Chapter 1', 'Chapter 2']],
    ['Science', ['Chapter 1', 'Chapter 2']],
    ['English', ['Reading and writing']],
  ] },
};

function node(title: string, createdAt: number, extra: Partial<GoalNode> = {}): GoalNode {
  return { id: uid('n'), kind: 'node', title, children: [], createdAt, ...extra };
}

export function buildStarterGoal(exam: StarterExam, customTitle = '', now = Date.now()): GoalNode {
  const leaf = (title: string) => node(title, now, { steps: [...STUDY_STEPS], stepDone: STUDY_STEPS.map(() => false) });
  if (exam === 'Other') {
    const title = customTitle.trim().slice(0, 80) || 'My goal';
    const steps = ['List the topics', 'Pick the first one', 'Do the first hour'];
    return {
      id: uid('g'), kind: 'goal', title, children: [node('Getting started', now, { steps, stepDone: steps.map(() => false) })], createdAt: now,
    };
  }
  const plan = PLANS[exam];
  return {
    id: uid('g'),
    kind: 'goal',
    title: plan.title,
    createdAt: now,
    children: plan.subjects.map(([subject, chapters]) => node(subject, now, { children: chapters.map(leaf) })),
  };
}

/** The first chapter in the goal: the one the tour plans for today. */
export function firstEndpoint(goal: GoalNode): GoalNode | null {
  for (const child of goal.children) {
    if (child.children.length === 0) return child;
    const found = firstEndpoint(child);
    if (found) return found;
  }
  return null;
}
