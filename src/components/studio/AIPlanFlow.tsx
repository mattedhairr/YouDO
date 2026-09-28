import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Browser } from '@capacitor/browser';
import { ArrowLeft, ArrowRight, Check, Clipboard, Copy, ExternalLink, Sparkles, Upload, Wand2 } from 'lucide-react';
import type { GoalNode } from '../../types';
import {
  buildSetupPrompt,
  appendGeneratedBlueprint,
  parseGeneratedBlueprint,
  validateBuildPlanSection,
  AI_PLAN_MAX_BYTES,
  type BuildPlanAnswers,
  type GeneratedBlueprintNode,
  type GeneratedBlueprintParseResult,
} from '../../lib/aiPlan';
import { StudioButton, StudioField } from './StudioControls';
import { buildPlanCorrectionPrompt } from '../../lib/aiPlanPrompt';
import { todayISO } from '../../lib/dates';

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
  daysPerWeek: 6,
  currentStatus: '',
  syllabusResources: '',
  constraintsPreferences: '',
  additionalInstructions: '',
  preparationStage: '', strongTopics: '', weakTopics: '', resources: '',
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
    <details><summary><ArrowRight size={13} /><strong>{node.title}</strong>{node.children.length > 0 && <span>{node.children.length}</span>}</summary>
      {node.description && <p className="studio-ai-node-description">{node.description}</p>}
      {(node.startDate || node.endDate) && <p className="studio-ai-node-description">{node.startDate ?? 'No start date'} → {node.endDate ?? 'No end date'}</p>}
      {node.steps && <ol className="studio-ai-checklist">{node.steps.map(step => <li key={step}>{step}</li>)}</ol>}
      {node.children.length > 0 && <GeneratedTree nodes={node.children} />}
    </details>
  </li>)}</ul>;
}

const SECTIONS = ['Your goal', 'Your routine', 'Your syllabus'] as const;
const PREPARATION_STAGES = ['Starting out', 'Partly prepared', 'Mainly revising'] as const;

export default function AIPlanFlow({ goals, onApply, onDirty }: Props) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [section, setSection] = useState<0 | 1 | 2>(0);
  const [dateMode, setDateMode] = useState<'date' | 'duration'>('date');
  const [answers, setAnswers] = useState<BuildPlanAnswers>(INITIAL_ANSWERS);
  const [prompt, setPrompt] = useState('');
  const [json, setJson] = useState('');
  const [result, setResult] = useState<GeneratedBlueprintParseResult | null>(null);
  const [formError, setFormError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [correction, setCorrection] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const copyTimer = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const validationRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRequest = useRef(0);
  const isDirty = useMemo(() => JSON.stringify(answers) !== JSON.stringify(INITIAL_ANSWERS) || Boolean(prompt || json), [answers, prompt, json]);
  const weeklyMinutes = (answers.dailyHours * 60 + answers.dailyMinutes) * answers.daysPerWeek;

  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);
  useEffect(() => () => { fileRequest.current += 1; if (copyTimer.current !== null) window.clearTimeout(copyTimer.current); }, []);
  useEffect(() => { headingRef.current?.focus(); headingRef.current?.closest('.studio-panel-body')?.scrollTo(0, 0); }, [stage, section]);
  useEffect(() => { if (formError || fileError) errorRef.current?.focus(); }, [formError, fileError]);
  useEffect(() => { if (result) validationRef.current?.focus(); }, [result]);

  const update = <K extends keyof BuildPlanAnswers>(key: K, value: BuildPlanAnswers[K]) => {
    setAnswers(current => ({ ...current, [key]: value }));
    setFormError('');
    setResult(null);
    setCorrection('');
  };
  const advance = () => {
    const error = validateBuildPlanSection(answers, section);
    if (error) { setFormError(error); return; }
    if (section < 2) setSection((section + 1) as 1 | 2);
    else {
      for (const part of [0, 1] as const) {
        const earlierError = validateBuildPlanSection(answers, part);
        if (earlierError) { setSection(part); setFormError(earlierError); return; }
      }
      setPrompt(buildSetupPrompt(answers));
      setCopyState('idle');
      setStage(2);
    }
  };
  const copy = async (text: string) => {
    const copied = await copyPrompt(text);
    setCopyState(copied ? 'copied' : 'failed');
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 3_000);
  };
  const preview = (text = json) => {
    const parsed = parseGeneratedBlueprint(text, { today: todayISO(), targetDate: answers.targetDate });
    if (parsed.ok) {
      const duplicate = goals.some(goal => goal.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === parsed.payload.goals[0].title.toLocaleLowerCase());
      if (duplicate) { setResult({ ok: false, error: `A goal named “${parsed.summary.goalName}” already exists. Ask the AI to give this new plan a different root title.` }); return; }
    }
    setResult(parsed);
  };
  const changeJSON = (text: string) => { fileRequest.current += 1; setFileBusy(false); setFileError(''); setJson(text); setResult(null); setCorrection(''); setCopyState('idle'); };
  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request = ++fileRequest.current;
    setCorrection(''); setCopyState('idle'); setFileBusy(false); setFileError('');
    if (file.size > AI_PLAN_MAX_BYTES) { setFileError('This file is larger than 500 KB. Choose a smaller plan. Your previous pasted text is unchanged.'); return; }
    setFileBusy(true);
    try {
      const text = await file.text();
      if (request !== fileRequest.current) return;
      setJson(text); preview(text);
    } catch { if (request === fileRequest.current) setFileError('This file could not be read. Try a JSON or text file, or paste the response. Your previous pasted text is unchanged.'); }
    finally { if (request === fileRequest.current) setFileBusy(false); }
  };
  const repair = () => {
    if (!result || result.ok) return;
    const text = buildPlanCorrectionPrompt(result.error, json, prompt);
    setCorrection(text);
    void copy(text);
  };
  const addToDraft = () => {
    if (!result?.ok || fileBusy) return;
    const appended = appendGeneratedBlueprint(goals, result.payload);
    if (!appended.ok) { setResult({ ok: false, error: appended.error }); return; }
    onDirty(false);
    onApply(appended.goals, `Added AI plan: ${result.summary.goalName}`);
  };
  const goTo = (next: 1 | 2 | 3) => { setCopyState('idle'); setStage(next); };

  return <>
    <div className="studio-ai-progress" aria-label={`Step ${stage} of 3`}>
      {['Describe', 'Ask AI', 'Review'].map((label, index) => <span key={label} aria-current={stage === index + 1 ? 'step' : undefined} className={stage === index + 1 ? 'is-active' : stage > index + 1 ? 'is-done' : ''}><i>{stage > index + 1 ? <Check size={10} /> : index + 1}</i>{label}</span>)}
    </div>

    {stage === 1 && <>
      <div className="studio-panel-body studio-ai-form">
        <div className="studio-ai-section-heading"><span>{section + 1} OF 3 DETAILS</span><h3 tabIndex={-1} ref={headingRef}>{SECTIONS[section]}</h3><p>{section === 0 ? 'Start with what you want to achieve and when.' : section === 1 ? 'Build around the time and energy you actually have.' : 'A few specifics help the AI plan the right work.'}</p></div>
        {section === 0 && <>
          <StudioField label="Exam or goal"><input className="studio-input" value={answers.examName} maxLength={120} onChange={event => update('examName', event.target.value)} placeholder="Name your exam, course, skill or project" /></StudioField>
          <p className="studio-ai-hint">For an exam, include the paper, stream or level if it matters. This helps the AI ask about the right syllabus.</p>
          <div className="studio-ai-choice" role="group" aria-label="Deadline type">{(['date', 'duration'] as const).map(mode => <button key={mode} type="button" aria-pressed={dateMode === mode} onClick={() => { setDateMode(mode); update(mode === 'date' ? 'timeRemaining' : 'targetDate', ''); }}>{mode === 'date' ? 'Choose a date' : 'Time remaining'}</button>)}</div>
          {dateMode === 'date'
            ? <StudioField label="Target date"><input className="studio-input" type="date" min={todayISO()} value={answers.targetDate} onChange={event => update('targetDate', event.target.value)} /></StudioField>
            : <StudioField label="Time remaining"><input className="studio-input" value={answers.timeRemaining} maxLength={80} onChange={event => update('timeRemaining', event.target.value)} placeholder="How many weeks or months do you have?" /></StudioField>}
          <div className="studio-ai-intro"><Sparkles size={19} /><p>YouDO creates a prompt for your preferred AI. You choose what to share, then review the plan before saving.</p></div>
          <button type="button" className="studio-ai-text-button" onClick={() => goTo(3)}>Already have a YouDO AI plan? Import it</button>
        </>}
        {section === 1 && <>
          <fieldset className="studio-ai-fieldset"><legend>Time available on a typical study day</legend><div className="studio-ai-time-grid">
            <StudioField label="Hours"><input className="studio-input" type="number" inputMode="numeric" min={0} max={23} value={answers.dailyHours || ''} placeholder="0" onChange={event => update('dailyHours', Number(event.target.value))} /></StudioField>
            <StudioField label="Minutes"><input className="studio-input" type="number" inputMode="numeric" min={0} max={59} value={answers.dailyMinutes || ''} placeholder="0" onChange={event => update('dailyMinutes', Number(event.target.value))} /></StudioField>
            <StudioField label="Days / week"><select className="studio-input" value={answers.daysPerWeek} onChange={event => update('daysPerWeek', Number(event.target.value))}>{[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day}</option>)}</select></StudioField>
          </div></fieldset>
          <p className="studio-ai-hint">Enter time you can usually protect for this goal, and choose the number of days you can repeat each week. Leave room for other commitments.</p>
          {Number.isFinite(weeklyMinutes) && weeklyMinutes > 0 && <p className="studio-ai-budget">{Math.round(weeklyMinutes / 60 * 10) / 10} hours available each week · the plan will keep about 20% free for catch-up.</p>}
          <fieldset className="studio-ai-fieldset"><legend>Where are you starting?</legend><div className="studio-ai-choice">{PREPARATION_STAGES.map(level => <button key={level} type="button" aria-pressed={answers.preparationStage === level} onClick={() => update('preparationStage', level)}>{level}</button>)}</div></fieldset>
          <StudioField label="What should the AI know about your progress? (optional)"><textarea className="studio-input" rows={2} value={answers.currentStatus} maxLength={800} onChange={event => update('currentStatus', event.target.value)} placeholder="What have you finished? What do recent practice or results tell you?" /></StudioField>
          <p className="studio-ai-hint">A rough starting point is useful. Mention completed work and any result you trust; leave out details you prefer not to share.</p>
          <StudioField label="Weak or unstarted topics (optional)"><textarea className="studio-input" rows={2} value={answers.weakTopics ?? ''} maxLength={1200} onChange={event => update('weakTopics', event.target.value)} placeholder="Which topics or skills are difficult or still untouched?" /></StudioField>
          <p className="studio-ai-hint">If you know why, mention whether you need understanding, recall, speed or more practice.</p>
          <StudioField label="Strong or completed topics (optional)"><textarea className="studio-input" rows={2} value={answers.strongTopics ?? ''} maxLength={1200} onChange={event => update('strongTopics', event.target.value)} placeholder="What can you already do? Does it only need revision?" /></StudioField>
          <p className="studio-ai-hint">This helps the plan spend less time reteaching work you have already mastered.</p>
        </>}
        {section === 2 && <>
          <StudioField label="Syllabus or subject list (recommended)"><textarea className="studio-input" rows={4} value={answers.syllabusResources} maxLength={12000} onChange={event => update('syllabusResources', event.target.value)} placeholder="Paste syllabus headings, remaining chapters or the official syllabus link." /></StudioField>
          <p className="studio-ai-hint">No list yet? The prompt asks the AI to clarify or verify the syllabus before planning.</p>
          <StudioField label="Resources you already use (optional)"><textarea className="studio-input" rows={2} value={answers.resources ?? ''} maxLength={2000} onChange={event => update('resources', event.target.value)} placeholder="Books, notes, lectures, past papers or your test series." /></StudioField>
          <StudioField label="What does the plan need to fit around? (optional)"><textarea className="studio-input" rows={2} value={answers.constraintsPreferences} maxLength={1200} onChange={event => update('constraintsPreferences', event.target.value)} placeholder="Fixed commitments, rest days or weeks with less time" /></StudioField>
          <details className="studio-disclosure"><summary>Anything else to include?</summary><StudioField label="Additional preferences"><textarea className="studio-input" rows={2} value={answers.additionalInstructions} maxLength={1200} onChange={event => update('additionalInstructions', event.target.value)} placeholder="Language, preferred order, accessibility needs or other preferences." /></StudioField></details>
        </>}
        {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-error">{formError}</p>}
      </div>
      <footer className="studio-panel-footer studio-ai-footer">{section > 0 ? <StudioButton quiet onClick={() => { setFormError(''); setSection((section - 1) as 0 | 1); }}><ArrowLeft size={14} /> Back</StudioButton> : <span className="studio-ai-hint">A plan built around you</span>}<StudioButton onClick={advance}>{section === 2 ? <><Wand2 size={15} /> Create prompt</> : <>Continue <ArrowRight size={14} /></>}</StudioButton></footer>
    </>}

    {stage === 2 && <>
      <div className="studio-panel-body studio-ai-form">
        <div className="studio-ai-section-heading"><h3 tabIndex={-1} ref={headingRef}>Take your brief to AI</h3><p>Copy the prompt, open an AI tool and paste it into a new chat.</p></div>
        <div className="studio-ai-brief"><strong>{answers.examName}</strong><span>{answers.targetDate || answers.timeRemaining} · {Math.round(weeklyMinutes / 60 * 10) / 10} hours / week</span></div>
        <StudioButton onClick={() => void copy(prompt)}>{copyState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}{copyState === 'copied' ? 'Copied!' : 'Copy prompt'}</StudioButton>
        {copyState === 'failed' && <p role="alert" className="studio-error">Copy was blocked. Open “Read your prompt” below, select the text and copy it.</p>}
        <div className="studio-ai-tools"><span>Then open</span><div>{AI_TOOLS.map(tool => <button type="button" key={tool.label} onClick={() => void openExternalUrl(tool.url)}>{tool.label}<ExternalLink size={11} /></button>)}</div></div>
        <ol className="studio-ai-instructions"><li>Answer any short clarification questions the AI asks.</li><li>Wait for the entire plan. Use <strong>Copy</strong> on its final JSON code block, or download its JSON file.</li><li>Return here to check the plan and add it to your draft.</li></ol>
        <details className="studio-disclosure"><summary>Read your prompt</summary><textarea className="studio-input studio-ai-prompt" readOnly value={prompt} aria-label="Generated setup prompt" onFocus={event => event.currentTarget.select()} /></details>
      </div>
      <footer className="studio-panel-footer studio-ai-footer"><StudioButton quiet onClick={() => goTo(1)}><ArrowLeft size={14} /> Edit details</StudioButton><StudioButton onClick={() => goTo(3)}>I have the plan <ArrowRight size={14} /></StudioButton></footer>
    </>}

    {stage === 3 && <>
      <div className="studio-panel-body studio-ai-form">
        <div className="studio-ai-section-heading"><h3 tabIndex={-1} ref={headingRef}>Bring your plan back</h3><p>Paste the complete response or choose its JSON file. Review it before adding anything.</p></div>
        <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={event => void loadFile(event)} />
        <StudioButton quiet disabled={fileBusy} onClick={() => fileRef.current?.click()}><Upload size={15} />{fileBusy ? 'Reading file…' : 'Choose JSON file'}</StudioButton>
        {fileError && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-error">{fileError}</p>}
        <textarea className="studio-input studio-ai-json" value={json} onChange={event => changeJSON(event.target.value)} placeholder="Paste the complete JSON block here…" aria-label="AI generated plan JSON" spellCheck={false} />
        {!result && <StudioButton disabled={!json.trim() || fileBusy} onClick={() => preview()}>Check and preview</StudioButton>}
        {result && !result.ok && <div ref={validationRef} tabIndex={-1} className="studio-ai-validation is-error" role="alert"><strong>Let’s fix the response</strong><p>{result.error}</p>{json && <StudioButton quiet onClick={repair}><Copy size={14} />{copyState === 'copied' ? 'Correction copied!' : 'Copy correction prompt'}</StudioButton>}<p>Paste the correction into the same AI conversation, then replace the text above with its complete new answer.</p></div>}
        {correction && <details className="studio-disclosure" open={copyState === 'failed' || undefined}><summary>Read correction prompt</summary><textarea className="studio-input studio-ai-prompt" readOnly value={correction} aria-label="Correction prompt" onFocus={event => event.currentTarget.select()} /></details>}
        {correction && copyState === 'failed' && <p role="alert" className="studio-error">Copy was blocked. Select and copy the correction text above.</p>}
        {result?.ok && <div className="studio-ai-preview">
          <div ref={validationRef} tabIndex={-1} className="studio-ai-validation is-valid"><Check size={16} /><div><strong>{result.summary.goalName}</strong><p>{result.summary.endpoints} tasks · {result.summary.branches} groups · {result.summary.checklistSteps} checklist steps</p>{(result.summary.startDate || result.summary.endDate) && <small>{result.summary.startDate ?? 'No start date'} → {result.summary.endDate ?? 'No end date'}</small>}</div></div>
          {result.notes.length > 0 && <ul className="studio-ai-notes">{result.notes.map(note => <li key={note}>{note}</li>)}</ul>}
          {result.payload.goals[0].description && <div className="studio-ai-plan-overview"><strong>Approach and time budget</strong><p>{result.payload.goals[0].description}</p></div>}
          <details className="studio-disclosure" open><summary>Review tasks and milestones <ArrowRight size={14} /></summary><GeneratedTree nodes={result.payload.goals[0].children} /></details>
          <p className="studio-context">Check the syllabus, workload and dates. A valid format does not verify exam facts. You can edit or undo this plan in Studio before saving.</p>
        </div>}
      </div>
      <footer className="studio-panel-footer studio-ai-footer"><StudioButton quiet onClick={() => goTo(prompt ? 2 : 1)}><ArrowLeft size={14} />{prompt ? 'Prompt' : 'Describe'}</StudioButton>{result?.ok && <StudioButton disabled={fileBusy} onClick={addToDraft}><Check size={15} /> Add to draft</StudioButton>}</footer>
    </>}
  </>;
}
