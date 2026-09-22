import { describe, expect, it } from 'vitest';
import {
  AI_PLAN_MAX_DEPTH,
  appendGeneratedBlueprint,
  buildSetupPrompt,
  materializeGeneratedBlueprint,
  parseGeneratedBlueprint,
  validateBuildPlanAnswers,
  type BuildPlanAnswers,
} from './aiPlan';

const answers = (patch: Partial<BuildPlanAnswers> = {}): BuildPlanAnswers => ({
  examName: 'GATE 2027',
  targetDate: '2027-02-07',
  timeRemaining: '',
  dailyHours: 3,
  dailyMinutes: 30,
  daysPerWeek: 6,
  currentStatus: 'Starting core subjects',
  syllabusResources: 'Official syllabus and class notes',
  constraintsPreferences: 'Keep Sundays for revision',
  additionalInstructions: 'Give extra practice to weak topics',
  ...patch,
});

const validPlan = () => ({
  tasks: [],
  goals: [{
    kind: 'goal', title: 'GATE 2027', startDate: '2026-09-22', endDate: '2027-02-07', children: [
      { kind: 'node', title: 'Foundation', children: [
        { kind: 'node', title: 'Network Theory', children: [], steps: ['Learn concepts', 'Solve questions'] },
      ] },
    ],
  }],
});

describe('AI plan prompt', () => {
  it('validates essential preparation fields', () => {
    expect(validateBuildPlanAnswers(answers())).toBeNull();
    expect(validateBuildPlanAnswers(answers({ examName: '' }))).toBe('Name the exam or goal.');
    expect(validateBuildPlanAnswers(answers({ targetDate: '', timeRemaining: '' }))).toContain('target date');
    expect(validateBuildPlanAnswers(answers({ dailyHours: 0, dailyMinutes: 0 }))).toContain('time available');
    expect(validateBuildPlanAnswers(answers({ currentStatus: '' }))).toContain('current preparation');
  });

  it('interpolates every answer into a deterministic static prompt', () => {
    const prompt = buildSetupPrompt(answers(), '2026-09-22');
    expect(prompt).toContain('Today: 2026-09-22');
    expect(prompt).toContain('Exam or goal: GATE 2027');
    expect(prompt).toContain('3 hours 30 minutes, 6 day(s) per week');
    expect(prompt).toContain('Give extra practice to weak topics');
    expect(prompt).not.toMatch(/\{\{[a-z_]+\}\}/);
  });

  it('labels omitted optional context without dropping fields', () => {
    const prompt = buildSetupPrompt(answers({ syllabusResources: '', constraintsPreferences: '', additionalInstructions: '' }), '2026-09-22');
    expect(prompt.match(/Not provided/g)).toHaveLength(4);
  });
});

describe('generated blueprint validation', () => {
  it('accepts raw and singly fenced JSON and summarizes the plan', () => {
    const raw = JSON.stringify(validPlan());
    const parsed = parseGeneratedBlueprint(raw);
    expect(parsed).toMatchObject({ ok: true, summary: { goalName: 'GATE 2027', nodes: 3, branches: 2, endpoints: 1, checklistSteps: 2 } });
    expect(parseGeneratedBlueprint(`\`\`\`json\n${raw}\n\`\`\``).ok).toBe(true);
  });

  it.each([
    ['not json', 'Paste one valid JSON'],
    [JSON.stringify({ goals: validPlan().goals }), 'only tasks and goals'],
    [JSON.stringify({ tasks: [{ title: 'Injected' }], goals: validPlan().goals }), 'empty array'],
    [JSON.stringify({ ...validPlan(), account: {} }), 'only tasks and goals'],
  ])('rejects an invalid envelope', (value, message) => {
    const result = parseGeneratedBlueprint(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('rejects operational fields and structural mistakes with a path', () => {
    const operational = validPlan();
    Object.assign(operational.goals[0].children[0], { completed: true });
    const first = parseGeneratedBlueprint(JSON.stringify(operational));
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error).toContain('GATE 2027 / Foundation');

    const dated = validPlan();
    Object.assign(dated.goals[0].children[0].children[0], { startDate: '2027-03-01', endDate: '2027-02-01' });
    const second = parseGeneratedBlueprint(JSON.stringify(dated));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('end date is before start date');
  });

  it('rejects duplicate siblings, steps on branches, too many steps, and excessive depth', () => {
    const duplicate = validPlan();
    duplicate.goals[0].children.push({ ...duplicate.goals[0].children[0] });
    expect(parseGeneratedBlueprint(JSON.stringify(duplicate)).ok).toBe(false);

    const branchSteps = validPlan();
    Object.assign(branchSteps.goals[0].children[0], { steps: ['No'] });
    expect(parseGeneratedBlueprint(JSON.stringify(branchSteps)).ok).toBe(false);

    const manySteps = validPlan();
    manySteps.goals[0].children[0].children[0].steps = Array.from({ length: 9 }, (_, index) => `Step ${index}`);
    expect(parseGeneratedBlueprint(JSON.stringify(manySteps)).ok).toBe(false);

    let child: Record<string, unknown> = { kind: 'node', title: 'End', children: [] };
    for (let depth = 0; depth < AI_PLAN_MAX_DEPTH; depth += 1) child = { kind: 'node', title: `Level ${depth}`, children: [child] };
    const deep = { tasks: [], goals: [{ kind: 'goal', title: 'Deep', children: [child] }] };
    expect(parseGeneratedBlueprint(JSON.stringify(deep)).ok).toBe(false);
  });

  it('materializes trusted content with fresh execution state', () => {
    const parsed = parseGeneratedBlueprint(JSON.stringify(validPlan()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [goal] = materializeGeneratedBlueprint(parsed.payload, 100);
    const endpoint = goal.children[0].children[0];
    expect(goal).toMatchObject({ kind: 'goal', completed: false, todayTaskId: null, pinned: false, createdAt: 100 });
    expect(endpoint).toMatchObject({ kind: 'node', steps: ['Learn concepts', 'Solve questions'], stepDone: [false, false], completed: false });
    expect(new Set([goal.id, goal.children[0].id, endpoint.id]).size).toBe(3);
  });

  it('appends one new root without changing existing goals and blocks title collisions', () => {
    const parsed = parseGeneratedBlueprint(JSON.stringify(validPlan()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const existing = materializeGeneratedBlueprint({ tasks: [], goals: [{ kind: 'goal', title: 'Existing', children: [] }] }, 10);
    const appended = appendGeneratedBlueprint(existing, parsed.payload, 20);
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.goals[0]).toBe(existing[0]);
    expect(appended.goals.map((goal) => goal.title)).toEqual(['Existing', 'GATE 2027']);
    expect(appendGeneratedBlueprint(appended.goals, parsed.payload).ok).toBe(false);
  });
});
