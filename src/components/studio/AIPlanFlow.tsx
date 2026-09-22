import { useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { ArrowLeft, ArrowRight, Check, Clipboard, Copy, ExternalLink, Sparkles, Wand2 } from 'lucide-react';
import type { GoalNode } from '../../types';
import {
  buildSetupPrompt,
  appendGeneratedBlueprint,
  parseGeneratedBlueprint,
  validateBuildPlanAnswers,
  type BuildPlanAnswers,
  type GeneratedBlueprintNode,
  type GeneratedBlueprintParseResult,
} from '../../lib/aiPlan';
import { StudioButton, StudioField } from './StudioControls';

type Apply = (goals: GoalNode[], summary: string) => void;

interface Props {
  goals: GoalNode[];
  onApply: Apply;
  onDirty: (dirty: boolean) => void;
}

const INITIAL_ANSWERS: BuildPlanAnswers = {
  examName: '',
  targetDate: '',
  timeRemaining: '',
  dailyHours: 0,
  dailyMinutes: 0,
  daysPerWeek: 7,
  currentStatus: '',
  syllabusResources: '',
  constraintsPreferences: '',
  additionalInstructions: '',
};

const AI_TOOLS = [
  { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { label: 'Claude', url: 'https://claude.ai/' },
  { label: 'Gemini', url: 'https://gemini.google.com/' },
] as const;

async function openExternalUrl(url: string): Promise<void> {
  try {
    await Browser.open({ url, toolbarColor: '#171612' });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function copyPrompt(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    textarea.remove();
    return copied;
  }
}

function GeneratedTree({ nodes }: { nodes: GeneratedBlueprintNode[] }) {
  return <ul className="studio-review-tree">{nodes.map((node, index) => <li key={`${node.title}-${index}`}>
    {node.children.length > 0
      ? <details><summary><ArrowRight size={13} /><strong>{node.title}</strong><span>{node.children.length}</span></summary><GeneratedTree nodes={node.children} /></details>
      : <div><Check size={12} /><span>{node.title}{node.steps?.length ? ` · ${node.steps.length} steps` : ''}</span></div>}
  </li>)}</ul>;
}

export default function AIPlanFlow({ goals, onApply, onDirty }: Props) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState<BuildPlanAnswers>(INITIAL_ANSWERS);
  const [prompt, setPrompt] = useState('');
  const [json, setJson] = useState('');
  const [result, setResult] = useState<GeneratedBlueprintParseResult | null>(null);
  const [formError, setFormError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<number | null>(null);
  const isDirty = useMemo(() => JSON.stringify(answers) !== JSON.stringify(INITIAL_ANSWERS) || Boolean(prompt || json), [answers, prompt, json]);

  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);
  useEffect(() => () => { if (copyTimer.current !== null) window.clearTimeout(copyTimer.current); }, []);

  const update = <K extends keyof BuildPlanAnswers>(key: K, value: BuildPlanAnswers[K]) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setFormError('');
  };
  const generate = () => {
    const error = validateBuildPlanAnswers(answers);
    if (error) { setFormError(error); return; }
    setPrompt(buildSetupPrompt(answers));
    setStage(2);
  };
  const copy = async () => {
    const copied = await copyPrompt(prompt);
    setCopyState(copied ? 'copied' : 'failed');
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2_000);
  };
  const preview = () => {
    const parsed = parseGeneratedBlueprint(json);
    if (parsed.ok) {
      const appended = appendGeneratedBlueprint(goals, parsed.payload);
      if (!appended.ok) {
        setResult({ ok: false, error: appended.error });
        return;
      }
    }
    setResult(parsed);
  };
  const addToDraft = () => {
    if (!result?.ok) return;
    const appended = appendGeneratedBlueprint(goals, result.payload);
    if (!appended.ok) { setResult({ ok: false, error: appended.error }); return; }
    onDirty(false);
    onApply(appended.goals, `Added AI plan: ${result.summary.goalName}`);
  };

  return <>
    <div className="studio-ai-progress" aria-label={`Step ${stage} of 3`}>
      {['Describe', 'Copy', 'Import'].map((label, index) => <span key={label} className={stage === index + 1 ? 'is-active' : stage > index + 1 ? 'is-done' : ''}><i>{stage > index + 1 ? <Check size={10} /> : index + 1}</i>{label}</span>)}
    </div>

    {stage === 1 && <>
      <div className="studio-panel-body studio-ai-form">
        <div className="studio-ai-intro"><Sparkles size={19} /><div><strong>Describe the preparation</strong><p>YouDO will turn these details into a prompt. Nothing is sent automatically.</p></div></div>
        <StudioField label="Exam or goal"><input className="studio-input" value={answers.examName} maxLength={120} onChange={(event) => update('examName', event.target.value)} placeholder="e.g. GATE 2027" autoFocus /></StudioField>
        <div className="studio-two-columns">
          <StudioField label="Target date"><input className="studio-input" type="date" value={answers.targetDate} onChange={(event) => update('targetDate', event.target.value)} /></StudioField>
          <StudioField label="Or time remaining"><input className="studio-input" value={answers.timeRemaining} maxLength={80} onChange={(event) => update('timeRemaining', event.target.value)} placeholder="e.g. About 5 months" /></StudioField>
        </div>
        <div className="studio-ai-time-grid">
          <StudioField label="Hours / study day"><input className="studio-input" type="number" min={0} max={23} value={answers.dailyHours} onChange={(event) => update('dailyHours', Number(event.target.value))} /></StudioField>
          <StudioField label="Minutes"><input className="studio-input" type="number" min={0} max={59} step={5} value={answers.dailyMinutes} onChange={(event) => update('dailyMinutes', Number(event.target.value))} /></StudioField>
          <StudioField label="Days / week"><input className="studio-input" type="number" min={1} max={7} value={answers.daysPerWeek} onChange={(event) => update('daysPerWeek', Number(event.target.value))} /></StudioField>
        </div>
        <StudioField label="Current preparation status"><textarea className="studio-input" rows={2} value={answers.currentStatus} maxLength={800} onChange={(event) => update('currentStatus', event.target.value)} placeholder="What is complete, what is weak, and where are you starting?" /></StudioField>
        <StudioField label="Syllabus, subjects, and resources (optional)"><textarea className="studio-input" rows={3} value={answers.syllabusResources} maxLength={3_000} onChange={(event) => update('syllabusResources', event.target.value)} placeholder="Paste subjects, syllabus headings, books, classes, or test series" /></StudioField>
        <StudioField label="Constraints and preferences (optional)"><textarea className="studio-input" rows={2} value={answers.constraintsPreferences} maxLength={1_200} onChange={(event) => update('constraintsPreferences', event.target.value)} placeholder="College, work, rest days, preferred planning style…" /></StudioField>
        <StudioField label="Anything else the AI should consider (optional)"><textarea className="studio-input" rows={2} value={answers.additionalInstructions} maxLength={1_200} onChange={(event) => update('additionalInstructions', event.target.value)} placeholder="Any special instruction for your plan" /></StudioField>
        {formError && <p role="alert" className="studio-error">{formError}</p>}
      </div>
      <footer className="studio-panel-footer"><StudioButton onClick={generate}><Wand2 size={15} /> Generate prompt</StudioButton></footer>
    </>}

    {stage === 2 && <>
      <div className="studio-panel-body">
        <div className="studio-ai-intro"><Copy size={19} /><div><strong>Copy this prompt</strong><p>Paste it into an AI tool. YouDO does not send it for you.</p></div></div>
        <textarea className="studio-input studio-ai-prompt" readOnly value={prompt} aria-label="Generated setup prompt" onFocus={(event) => event.currentTarget.select()} />
        <div className="studio-ai-copy-row">
          <StudioButton onClick={() => void copy()}>{copyState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}{copyState === 'copied' ? 'Copied!' : 'Copy prompt'}</StudioButton>
          {copyState === 'failed' && <span role="alert">Copy failed. Select the prompt and copy it manually.</span>}
        </div>
        <div className="studio-ai-tools"><span>Copy first, then open</span><div>{AI_TOOLS.map((tool) => <button type="button" key={tool.label} onClick={() => void openExternalUrl(tool.url)}>{tool.label}<ExternalLink size={11} /></button>)}</div></div>
      </div>
      <footer className="studio-panel-footer studio-ai-footer"><StudioButton quiet onClick={() => setStage(1)}><ArrowLeft size={14} /> Edit details</StudioButton><StudioButton onClick={() => setStage(3)}>Paste AI result <ArrowRight size={14} /></StudioButton></footer>
    </>}

    {stage === 3 && <>
      <div className="studio-panel-body">
        <div className="studio-ai-intro"><Clipboard size={19} /><div><strong>Paste the JSON result</strong><p>It will be checked and previewed before anything enters your draft.</p></div></div>
        <textarea className="studio-input studio-ai-json" value={json} onChange={(event) => { setJson(event.target.value); setResult(null); }} placeholder={'{\n  "tasks": [],\n  "goals": [...]\n}'} aria-label="AI generated plan JSON" />
        {!result && <StudioButton quiet disabled={!json.trim()} onClick={preview}>Preview plan</StudioButton>}
        {result && !result.ok && <div className="studio-ai-validation is-error" role="alert"><strong>Plan needs a correction</strong><p>{result.error}</p><button type="button" onClick={() => setResult(null)}>Edit pasted JSON</button></div>}
        {result?.ok && <div className="studio-ai-preview">
          <div className="studio-ai-validation is-valid"><Check size={16} /><div><strong>{result.summary.goalName}</strong><p>{result.summary.nodes} items · {result.summary.branches} branches · {result.summary.endpoints} endpoint tasks{result.summary.checklistSteps ? ` · ${result.summary.checklistSteps} steps` : ''}</p>{(result.summary.startDate || result.summary.endDate) && <small>{result.summary.startDate ?? 'No start'} → {result.summary.endDate ?? 'No end'}</small>}</div></div>
          <details className="studio-disclosure"><summary>Preview goal tree <ArrowRight size={14} /></summary><GeneratedTree nodes={result.payload.goals} /></details>
          <p className="studio-context">This adds one undoable Studio draft change. Existing goals, Today cards, and history stay untouched.</p>
        </div>}
      </div>
      <footer className="studio-panel-footer studio-ai-footer"><StudioButton quiet onClick={() => setStage(2)}><ArrowLeft size={14} /> Prompt</StudioButton>{result?.ok && <StudioButton onClick={addToDraft}><Check size={15} /> Add to draft</StudioButton>}</footer>
    </>}
  </>;
}
