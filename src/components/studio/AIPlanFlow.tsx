import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Browser } from '@capacitor/browser';
import { ArrowLeft, ArrowRight, Check, Clipboard, Copy, ExternalLink, Sparkles, Upload } from 'lucide-react';
import type { GoalNode } from '../../types';
import {
  buildMasterPlanningPrompt,
  appendGeneratedBlueprint,
  parseGeneratedBlueprint,
  AI_PLAN_MAX_BYTES,
  type GeneratedBlueprintNode,
  type GeneratedBlueprintParseResult,
} from '../../lib/aiPlan';
import { StudioButton } from './StudioControls';
import { buildPlanCorrectionPrompt } from '../../lib/aiPlanPrompt';
import { todayISO } from '../../lib/dates';

type Apply = (goals: GoalNode[], summary: string) => void;

interface Props {
  goals: GoalNode[];
  onApply: Apply;
  onDirty: (dirty: boolean) => void;
}

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
  return (
    <ul className="studio-review-tree">
      {nodes.map((node, index) => (
        <li key={`${node.title}-${index}`}>
          <details>
            <summary>
              <ArrowRight size={13} />
              <strong>{node.title}</strong>
              {node.children.length > 0 && <span>{node.children.length}</span>}
            </summary>
            {node.description && <p className="studio-ai-node-description">{node.description}</p>}
            {(node.startDate || node.endDate) && (
              <p className="studio-ai-node-description">
                {node.startDate ?? 'No start date'} → {node.endDate ?? 'No end date'}
              </p>
            )}
            {node.steps && (
              <ol className="studio-ai-checklist">
                {node.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {node.children.length > 0 && <GeneratedTree nodes={node.children} />}
          </details>
        </li>
      ))}
    </ul>
  );
}

export default function AIPlanFlow({ goals, onApply, onDirty }: Props) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [json, setJson] = useState('');
  const [result, setResult] = useState<GeneratedBlueprintParseResult | null>(null);
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

  const prompt = useMemo(() => buildMasterPlanningPrompt(todayISO()), []);
  const isDirty = useMemo(() => Boolean(json.trim()), [json]);

  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);
  useEffect(() => () => {
    fileRequest.current += 1;
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.closest('.studio-panel-body')?.scrollTo(0, 0);
  }, [stage]);
  useEffect(() => {
    if (fileError) errorRef.current?.focus();
  }, [fileError]);
  useEffect(() => {
    if (result) validationRef.current?.focus();
  }, [result]);

  const copy = async (text: string) => {
    const copied = await copyPrompt(text);
    setCopyState(copied ? 'copied' : 'failed');
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 3_000);
  };

  const preview = (text = json) => {
    const parsed = parseGeneratedBlueprint(text, { today: todayISO() });
    if (parsed.ok) {
      const duplicate = goals.some(
        (goal) => goal.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === parsed.payload.goals[0].title.toLocaleLowerCase()
      );
      if (duplicate) {
        setResult({
          ok: false,
          error: `A goal named “${parsed.summary.goalName}” already exists. Ask the AI to give this new plan a different root title.`,
        });
        return;
      }
    }
    setResult(parsed);
  };

  const changeJSON = (text: string) => {
    fileRequest.current += 1;
    setFileBusy(false);
    setFileError('');
    setJson(text);
    setResult(null);
    setCorrection('');
    setCopyState('idle');
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request = ++fileRequest.current;
    setCorrection('');
    setCopyState('idle');
    setFileBusy(false);
    setFileError('');
    if (file.size > AI_PLAN_MAX_BYTES) {
      setFileError('This file is larger than 500 KB. Choose a smaller plan. Your previous pasted text is unchanged.');
      return;
    }
    setFileBusy(true);
    try {
      const text = await file.text();
      if (request !== fileRequest.current) return;
      setJson(text);
      preview(text);
    } catch {
      if (request === fileRequest.current) {
        setFileError('This file could not be read. Try a JSON or text file, or paste the response. Your previous pasted text is unchanged.');
      }
    } finally {
      if (request === fileRequest.current) setFileBusy(false);
    }
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
    if (!appended.ok) {
      setResult({ ok: false, error: appended.error });
      return;
    }
    onDirty(false);
    onApply(appended.goals, `Added AI plan: ${result.summary.goalName}`);
  };

  const goTo = (next: 1 | 2) => {
    setCopyState('idle');
    setStage(next);
  };

  return (
    <>
      <div className="studio-ai-progress" aria-label={`Step ${stage} of 2`}>
        {['Prompt AI', 'Import & Review'].map((label, index) => (
          <span
            key={label}
            aria-current={stage === index + 1 ? 'step' : undefined}
            className={stage === index + 1 ? 'is-active' : stage > index + 1 ? 'is-done' : ''}
          >
            <i>{stage > index + 1 ? <Check size={10} /> : index + 1}</i>
            {label}
          </span>
        ))}
      </div>

      {stage === 1 && (
        <>
          <div className="studio-panel-body studio-ai-form">
            <div className="studio-ai-section-heading">
              <span>STEP 1 OF 2 · AI MENTOR SETUP</span>
              <h3 tabIndex={-1} ref={headingRef}>Prompt Your AI Planner</h3>
              <p>YouDO equips ChatGPT, Claude or Gemini to interview you conversationally and design a tailored, daily-actionable preparation blueprint.</p>
            </div>

            <div className="studio-ai-intro">
              <Sparkles size={20} className="shrink-0 mt-0.5" />
              <div>
                <strong>How it works</strong>
                <p>
                  1. Copy the master prompt below.<br />
                  2. Open your preferred AI (ChatGPT, Claude, or Gemini).<br />
                  3. The AI will ask a few short questions about your goal and routine, propose a roadmap, and output a copyable YouDO plan.
                </p>
              </div>
            </div>

            <StudioButton onClick={() => void copy(prompt)}>
              {copyState === 'copied' ? <Check size={15} /> : <Clipboard size={15} />}
              {copyState === 'copied' ? 'Master prompt copied!' : 'Copy Master Prompt'}
            </StudioButton>

            {copyState === 'failed' && (
              <p role="alert" className="studio-error">
                Copy was blocked. Open “Read full prompt instructions” below, select the text and copy it.
              </p>
            )}

            <div className="studio-ai-tools">
              <span>Open your AI tool:</span>
              <div>
                {AI_TOOLS.map((tool) => (
                  <button type="button" key={tool.label} onClick={() => void openExternalUrl(tool.url)}>
                    {tool.label} <ExternalLink size={11} />
                  </button>
                ))}
              </div>
            </div>

            <details className="studio-disclosure">
              <summary>Read full prompt instructions</summary>
              <textarea
                className="studio-input studio-ai-prompt"
                readOnly
                value={prompt}
                aria-label="Generated master prompt"
                onFocus={(event) => event.currentTarget.select()}
              />
            </details>
          </div>
          <footer className="studio-panel-footer studio-ai-footer">
            <span className="studio-ai-hint">Interview your AI, then bring the plan back</span>
            <StudioButton onClick={() => goTo(2)}>
              I have the plan <ArrowRight size={14} />
            </StudioButton>
          </footer>
        </>
      )}

      {stage === 2 && (
        <>
          <div className="studio-panel-body studio-ai-form">
            <div className="studio-ai-section-heading">
              <span>STEP 2 OF 2 · VERIFY & APPLY</span>
              <h3 tabIndex={-1} ref={headingRef}>Import & Review Plan</h3>
              <p>Paste the complete JSON block from your AI conversation or choose a saved JSON file.</p>
            </div>

            <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={(event) => void loadFile(event)} />
            <StudioButton quiet disabled={fileBusy} onClick={() => fileRef.current?.click()}>
              <Upload size={15} />
              {fileBusy ? 'Reading file…' : 'Choose JSON file'}
            </StudioButton>

            {fileError && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-error">{fileError}</p>}

            <textarea
              className="studio-input studio-ai-json"
              value={json}
              onChange={(event) => changeJSON(event.target.value)}
              placeholder="Paste the complete ```json code block here…"
              aria-label="AI generated plan JSON"
              spellCheck={false}
            />

            {!result && (
              <StudioButton disabled={!json.trim() || fileBusy} onClick={() => preview()}>
                Check and preview
              </StudioButton>
            )}

            {result && !result.ok && (
              <div ref={validationRef} tabIndex={-1} className="studio-ai-validation is-error" role="alert">
                <strong>Let’s fix the response</strong>
                <p>{result.error}</p>
                {json && (
                  <StudioButton quiet onClick={repair}>
                    <Copy size={14} />
                    {copyState === 'copied' ? 'Correction copied!' : 'Copy correction prompt'}
                  </StudioButton>
                )}
                <p>Paste the correction into the same AI conversation, then replace the text above with its complete new answer.</p>
              </div>
            )}

            {correction && (
              <details className="studio-disclosure" open={copyState === 'failed' || undefined}>
                <summary>Read correction prompt</summary>
                <textarea
                  className="studio-input studio-ai-prompt"
                  readOnly
                  value={correction}
                  aria-label="Correction prompt"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </details>
            )}

            {correction && copyState === 'failed' && (
              <p role="alert" className="studio-error">Copy was blocked. Select and copy the correction text above.</p>
            )}

            {result?.ok && (
              <div className="studio-ai-preview">
                <div ref={validationRef} tabIndex={-1} className="studio-ai-validation is-valid">
                  <Check size={16} />
                  <div>
                    <strong>{result.summary.goalName}</strong>
                    <p>
                      {result.summary.endpoints} tasks · {result.summary.branches} groups · {result.summary.checklistSteps} checklist steps
                    </p>
                    {(result.summary.startDate || result.summary.endDate) && (
                      <small>
                        {result.summary.startDate ?? 'No start date'} → {result.summary.endDate ?? 'No end date'}
                      </small>
                    )}
                  </div>
                </div>
                {result.notes.length > 0 && (
                  <ul className="studio-ai-notes">
                    {result.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
                {result.payload.goals[0].description && (
                  <div className="studio-ai-plan-overview">
                    <strong>Approach and time budget</strong>
                    <p>{result.payload.goals[0].description}</p>
                  </div>
                )}
                <details className="studio-disclosure" open>
                  <summary>
                    Review tasks and milestones <ArrowRight size={14} />
                  </summary>
                  <GeneratedTree nodes={result.payload.goals[0].children} />
                </details>
                <p className="studio-context">
                  Check the syllabus, workload and dates. You can edit or undo this plan in Studio before saving.
                </p>
              </div>
            )}
          </div>
          <footer className="studio-panel-footer studio-ai-footer">
            <StudioButton quiet onClick={() => goTo(1)}>
              <ArrowLeft size={14} /> Back to Prompt
            </StudioButton>
            {result?.ok && (
              <StudioButton disabled={fileBusy} onClick={addToDraft}>
                <Check size={15} /> Add to draft
              </StudioButton>
            )}
          </footer>
        </>
      )}
    </>
  );
}
