import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  FilePenLine,
  Layers3,
  ListPlus,
  ListTree,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { GoalKind, GoalNode } from '../types';
import type { GoalTreeChangeResult } from '../store';
import {
  BLUEPRINT_LABELS,
  addBlueprintChildren,
  addBlueprintSteps,
  blueprintChildrenAt,
  countBlueprintNodes,
  findBlueprintPath,
  makeBlueprintNode,
  maxBlueprintDepth,
  nextKindAfter,
  normalizeBlueprintTitles,
  numberedBlueprintTitles,
  removeBlueprintNodes,
  renameBlueprintNodes,
} from '../lib/blueprintStudio';
import { findGoal } from '../lib/goalTree';
import Overlay from './Overlay';

type Candidate = GoalKind | 'steps';

type Screen =
  | { type: 'home' }
  | { type: 'goal' }
  | { type: 'question'; parentIds: string[]; candidate: Candidate }
  | { type: 'items'; parentIds: string[]; candidate: Candidate }
  | { type: 'branches'; createdIds: string[]; kind: GoalKind }
  | { type: 'browse'; parentId: string | null; pathIds: string[]; selectedIds: string[] }
  | { type: 'actions'; selectedIds: string[]; returnBrowse: Extract<Screen, { type: 'browse' }> }
  | { type: 'rename'; selectedIds: string[] }
  | { type: 'details'; nodeId: string }
  | { type: 'preview'; summary: string };

interface Snapshot {
  screen: Screen;
  goals: GoalNode[];
}

interface Props {
  open: boolean;
  goals: GoalNode[];
  onClose: () => void;
  onCommit: (baseGoals: GoalNode[], nextGoals: GoalNode[], summary: string) => GoalTreeChangeResult;
}

interface GuidedExample {
  placeholder: string[];
  quick: { title: string; structure: string; why: string };
  detailed: { title: string; structure: string; why: string };
}

const examples: Record<Candidate, GuidedExample> = {
  goal: {
    placeholder: ['Prepare for my target exam'],
    quick: {
      title: 'Prepare confidently for my upcoming exam',
      structure: 'One clear preparation result you want to reach.',
      why: 'The goal names your final destination. The detailed study work comes in the levels below it.',
    },
    detailed: {
      title: 'Be fully prepared before exam day',
      structure: 'Goal: Cover the syllabus, practise enough questions, revise weak areas, and feel exam-ready.',
      why: 'This works for any exam because it describes the result, not a particular subject. Later, you will add your own subjects, topics, and study material underneath it.',
    },
  },
  phase: {
    placeholder: ['Build the foundation', 'Cover the syllabus', 'Revise and practise'],
    quick: {
      title: 'Goal: Prepare for my target exam',
      structure: 'Build foundation → Cover syllabus → Revise and practise',
      why: 'Phases are the big stages of preparation, usually followed in order.',
    },
    detailed: {
      title: 'A longer preparation plan',
      structure: 'Learn the basics → Complete every subject → Practise mixed questions → Final revision',
      why: 'Each phase holds one broad stage of preparation. You can fully plan the first phase today and leave later phases as empty shells until you are ready for them.',
    },
  },
  section: {
    placeholder: ['Concept learning', 'Question practice', 'Revision'],
    quick: {
      title: 'Phase: Build the foundation',
      structure: 'Concept learning · Basic questions · Weekly revision',
      why: 'Sections keep related preparation work together inside one phase.',
    },
    detailed: {
      title: 'Phase: Cover the syllabus',
      structure: 'Your first subject · Your second subject · Your remaining subjects',
      why: 'Replace these labels with the real subjects or syllabus areas required by your exam. Sections let you keep each subject separate while working through the same preparation phase.',
    },
  },
  task: {
    placeholder: ['Study one topic', 'Solve its practice set', 'Review my mistakes'],
    quick: {
      title: 'Section: One subject',
      structure: 'Complete Topic 1 · Complete Topic 2 · Complete Topic 3',
      why: 'Tasks are clear pieces of preparation work that you can finish.',
    },
    detailed: {
      title: 'Section: Question practice',
      structure: 'Solve a basic set · Solve a timed set · Review every wrong answer',
      why: 'A useful task begins with an action and has a visible result. “Solve a timed set” is clearer than a vague label such as “Do some practice.”',
    },
  },
  sub: {
    placeholder: ['Learn the concept', 'Make short notes', 'Practise questions'],
    quick: {
      title: 'Task: Complete one topic',
      structure: 'Learn the concept · Make short notes · Practise questions',
      why: 'Subtasks turn one larger study task into smaller, manageable parts.',
    },
    detailed: {
      title: 'Task: Improve a weak topic',
      structure: 'Find the exact weak concept · Learn it again · Solve targeted questions · Check improvement',
      why: 'Use subtasks when a study task still feels too large for one sitting. Each subtask should move you closer to finishing the parent topic.',
    },
  },
  leaf: {
    placeholder: ['Study one lesson', 'Solve one question set', 'Review one weak area'],
    quick: {
      title: 'Subtask: Practise questions',
      structure: 'Question Set 1 · Question Set 2 · Review mistakes',
      why: 'Leaf tasks are the smallest study pieces you want to schedule separately.',
    },
    detailed: {
      title: 'Subtask: Revise one topic',
      structure: 'Read the short notes · Recall without looking · Solve a small test · Mark remaining doubts',
      why: 'Stop dividing when each item is small, clear, and realistic for one focused sitting. That final schedulable study item is a leaf task.',
    },
  },
  steps: {
    placeholder: ['Open the material', 'Study with focus', 'Mark doubts', 'Quick review'],
    quick: {
      title: 'Leaf task: Solve Question Set 1',
      structure: 'Set a timer → Solve → Check answers → Note mistakes',
      why: 'Steps are a short checklist inside one final study task.',
    },
    detailed: {
      title: 'Leaf task: Revise one lesson',
      structure: 'Read notes → Close the notes and recall → Check what was missed → Mark the weak points',
      why: 'Steps do not create another hierarchy level. They simply explain what “completed properly” means for this one study task.',
    },
  },
};

const candidateLabel = (candidate: Candidate) =>
  candidate === 'steps' ? { singular: 'step', plural: 'steps', hint: 'Small repeatable checks inside a leaf task.' } : BLUEPRINT_LABELS[candidate];

function nextCandidate(candidate: Candidate): Candidate | null {
  if (candidate === 'steps') return null;
  return nextKindAfter(candidate);
}

function candidateQuestion(candidate: Candidate): string {
  const questions: Record<Candidate, string> = {
    goal: 'What result do you want to achieve?',
    phase: 'Would it help to split this goal into a few big stages?',
    section: 'Would it help to group related work inside this stage?',
    task: 'Do you want to list the actual work that needs to be finished?',
    sub: 'Would smaller parts make this work easier to start?',
    leaf: 'Do you want to split this into the smallest pieces you can schedule?',
    steps: 'Would a short checklist make each final item easier to complete?',
  };
  return questions[candidate];
}

function pathLabel(goals: GoalNode[], id: string): string {
  return findBlueprintPath(goals, id).map((node) => node.title).join(' / ');
}

function StudioButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}) {
  const styles = {
    primary: 'bg-primary text-on-primary border-primary shadow-[0_10px_28px_-16px_var(--primary)]',
    secondary: 'bg-elevated text-content-primary border-subtle',
    quiet: 'bg-transparent text-content-secondary border-transparent',
    danger: 'bg-error-soft text-error border-error/20',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-[12px] border px-4 text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

function StudioTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="text-[24px] leading-[1.08] tracking-[-0.035em] font-bold text-content-primary">{title}</h2>
      <p className="text-[13px] leading-relaxed text-content-secondary max-w-sm">{copy}</p>
    </div>
  );
}

function ExampleHint({ candidate }: { candidate: Candidate }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const guide = examples[candidate];
  return (
    <div className="rounded-[12px] border border-subtle bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setStage((value) => value === 0 ? 1 : 0)}
        className="w-full min-h-11 px-3.5 flex items-center justify-between gap-3 text-left"
      >
        <span className="text-[12px] font-semibold text-content-secondary">Not sure what this level means?</span>
        <span className="text-[11px] font-bold text-primary">{stage > 0 ? 'Hide' : 'See a quick example'}</span>
      </button>
      {stage > 0 && (
        <div className="px-3.5 pb-3.5 border-t border-subtle pt-3 space-y-3 fade-in">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Quick example</p>
            <p className="mt-1.5 text-[12.5px] font-bold text-content-primary">{guide.quick.title}</p>
            <p className="mt-1 text-[12px] font-semibold text-primary">{guide.quick.structure}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-content-secondary">{guide.quick.why}</p>
          </div>
          {stage === 1 ? (
            <button type="button" onClick={() => setStage(2)} className="w-full min-h-10 rounded-[10px] border border-primary/20 bg-primary-soft px-3 text-[11.5px] font-bold text-primary inline-flex items-center justify-center gap-1.5">
              Still not clear? Show another example <ChevronRight size={13} />
            </button>
          ) : (
            <div className="rounded-[11px] border border-subtle bg-elevated p-3 fade-in">
              <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted">One more, explained slowly</p>
              <p className="mt-1.5 text-[12.5px] font-bold text-content-primary">{guide.detailed.title}</p>
              <p className="mt-1 text-[12px] font-semibold text-primary">{guide.detailed.structure}</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-content-secondary">{guide.detailed.why}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalStarter({ onContinue }: { onContinue: (value: { title: string; description?: string; startDate?: string; endDate?: string }) => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState(false);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="space-y-5">
      <StudioTitle
        eyebrow="Create · First thought"
        title="What do you want to achieve?"
        copy="Start with the outcome. Studio will help you decide how much structure it actually needs."
      />
      <div className="rounded-[16px] border border-subtle bg-elevated p-4 shadow-card space-y-3">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-content-muted">Goal name</label>
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && title.trim()) onContinue({ title: title.trim(), description: description.trim() || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
          }}
          placeholder="Name the outcome you want"
          className="w-full h-12 bg-base border border-subtle rounded-[12px] px-3.5 text-[15px] font-semibold text-content-primary placeholder:text-content-muted outline-none focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button type="button" onClick={() => setDetails((value) => !value)} className="text-[12px] font-semibold text-primary inline-flex items-center gap-1.5">
          {details ? <Minus size={13} /> : <Plus size={13} />}
          {details ? 'Hide optional details' : 'Add details or dates'}
        </button>
        {details && (
          <div className="space-y-3 pt-1 fade-in">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Why this matters, or what success looks like"
              rows={3}
              className="w-full bg-base border border-subtle rounded-[12px] px-3.5 py-3 text-[13px] text-content-primary placeholder:text-content-muted outline-none focus:border-primary resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Start<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-2 text-[12px] text-content-primary outline-none focus:border-primary" /></label>
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Finish<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-2 text-[12px] text-content-primary outline-none focus:border-primary" /></label>
            </div>
          </div>
        )}
      </div>
      <ExampleHint candidate="goal" />
      <StudioButton onClick={() => onContinue({ title: title.trim(), description: description.trim() || undefined, startDate: startDate || undefined, endDate: endDate || undefined })} disabled={!title.trim()}>
        Shape this goal <ArrowRight size={15} />
      </StudioButton>
    </div>
  );
}

function ItemComposer({
  candidate,
  parentCount,
  onContinue,
}: {
  candidate: Candidate;
  parentCount: number;
  onContinue: (titles: string[]) => void;
}) {
  const label = candidateLabel(candidate);
  const [mode, setMode] = useState<'names' | 'numbered'>('names');
  const [text, setText] = useState('');
  const [prefix, setPrefix] = useState(candidate === 'steps' ? 'Step' : label.singular.replace(/^./, (letter) => letter.toUpperCase()));
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(5);
  const names = useMemo(
    () => mode === 'names' ? normalizeBlueprintTitles(text.split(/\r?\n|,/)) : numberedBlueprintTitles(prefix, start, count),
    [mode, text, prefix, start, count],
  );
  const total = candidate === 'steps' ? names.length * parentCount : names.length * parentCount;

  return (
    <div className="space-y-5">
      <StudioTitle
        eyebrow={`Build · ${label.plural}`}
        title={`Add ${label.plural} without the repetition.`}
        copy={parentCount > 1 ? `This structure will be repeated inside ${parentCount} selected branches.` : 'Add real names or generate a clean numbered sequence.'}
      />
      <div className="p-1 rounded-[12px] bg-surface border border-subtle grid grid-cols-2">
        {(['names', 'numbered'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setMode(value)} className={`h-10 rounded-[9px] text-[12px] font-bold ${mode === value ? 'bg-elevated text-primary shadow-card' : 'text-content-muted'}`}>
            {value === 'names' ? 'Name them' : 'Numbered range'}
          </button>
        ))}
      </div>
      <div className="rounded-[16px] border border-subtle bg-elevated p-4 space-y-3">
        {mode === 'names' ? (
          <>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-content-muted">One per line</label>
            <textarea
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={examples[candidate].placeholder.join('\n')}
              rows={6}
              className="w-full bg-base border border-subtle rounded-[12px] px-3.5 py-3 text-[14px] leading-7 text-content-primary placeholder:text-content-muted outline-none focus:border-primary resize-none"
            />
          </>
        ) : (
          <div className="space-y-4">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-content-muted">Label</label>
            <input value={prefix} onChange={(event) => setPrefix(event.target.value)} className="w-full h-11 bg-base border border-subtle rounded-[12px] px-3.5 text-[14px] font-semibold text-content-primary outline-none focus:border-primary" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Start at<input type="number" min={0} max={999} value={start} onChange={(event) => setStart(Number(event.target.value))} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-3 text-[14px] text-content-primary outline-none focus:border-primary" /></label>
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">How many<input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-3 text-[14px] text-content-primary outline-none focus:border-primary" /></label>
            </div>
          </div>
        )}
      </div>
      {names.length > 0 && (
        <div className="rounded-[12px] border border-primary/20 bg-primary-soft px-3.5 py-3 fade-in">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Preview</span>
            <span className="text-[11px] font-semibold text-content-secondary">{total} {candidate === 'steps' ? 'step placements' : 'new items'}</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-content-primary line-clamp-2">{names.slice(0, 5).join(' · ')}{names.length > 5 ? ` · +${names.length - 5} more` : ''}</p>
        </div>
      )}
      <ExampleHint candidate={candidate} />
      <StudioButton onClick={() => onContinue(names)} disabled={names.length === 0}>
        Add {names.length || ''} {names.length === 1 ? label.singular : label.plural} <ArrowRight size={15} />
      </StudioButton>
    </div>
  );
}

function BranchChooser({
  goals,
  nodeIds,
  kind,
  onContinue,
  onFinish,
}: {
  goals: GoalNode[];
  nodeIds: string[];
  kind: GoalKind;
  onContinue: (ids: string[]) => void;
  onFinish: () => void;
}) {
  const nodes = nodeIds.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));
  const [selected, setSelected] = useState<string[]>(nodes[0] ? [nodes[0].id] : []);
  const label = BLUEPRINT_LABELS[kind];

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <div className="space-y-5">
      <StudioTitle
        eyebrow="Choose your depth"
        title={`Which ${label.plural} do you want to build now?`}
        copy="Select one, several, or all. Everything else stays as a ready-to-use shell for later."
      />
      <div className="rounded-[16px] border border-subtle bg-surface overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-subtle flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-content-secondary">{selected.length} of {nodes.length} selected</span>
          <div className="flex gap-3">
            <button type="button" onClick={() => setSelected(nodes.map((node) => node.id))} className="text-[11px] font-bold text-primary">All</button>
            <button type="button" onClick={() => setSelected([])} className="text-[11px] font-bold text-content-muted">Later</button>
          </div>
        </div>
        <div className="max-h-[40vh] overflow-y-auto no-scrollbar">
          {nodes.map((node, index) => {
            const active = selected.includes(node.id);
            return (
              <button
                type="button"
                key={node.id}
                onClick={() => toggle(node.id)}
                className={`w-full min-h-[58px] px-3.5 py-2.5 flex items-center gap-3 text-left ${index < nodes.length - 1 ? 'border-b border-subtle' : ''} ${active ? 'bg-primary-soft' : 'bg-elevated/40'}`}
              >
                <span className={`w-6 h-6 rounded-full border grid place-items-center shrink-0 ${active ? 'bg-primary border-primary text-on-primary' : 'border-border text-transparent'}`}><Check size={14} strokeWidth={3} /></span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-bold truncate ${active ? 'text-content-primary' : 'text-content-secondary'}`}>{node.title}</span>
                  <span className="block mt-0.5 text-[10.5px] text-content-muted truncate">{pathLabel(goals, node.id)}</span>
                </span>
                {!active && <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Later</span>}
              </button>
            );
          })}
        </div>
      </div>
      {selected.length > 1 && (
        <div className="flex gap-2.5 rounded-[12px] bg-primary-soft border border-primary/15 p-3 text-[12px] leading-relaxed text-content-secondary">
          <Sparkles size={15} className="text-primary shrink-0 mt-0.5" />
          The next structure will be repeated across these {selected.length} branches. Select one branch if you want to customize it separately.
        </div>
      )}
      <div className="grid grid-cols-1 gap-2">
        <StudioButton onClick={() => onContinue(selected)} disabled={selected.length === 0}>
          Build selected <ArrowRight size={15} />
        </StudioButton>
        <StudioButton onClick={onFinish} variant="quiet">Leave these as shells and review</StudioButton>
      </div>
    </div>
  );
}

function BrowseTree({
  goals,
  screen,
  selectedIds,
  onScreen,
  onSelectionChange,
  onContinue,
}: {
  goals: GoalNode[];
  screen: Extract<Screen, { type: 'browse' }>;
  selectedIds: string[];
  onScreen: (screen: Extract<Screen, { type: 'browse' }>) => void;
  onSelectionChange: (ids: string[]) => void;
  onContinue: () => void;
}) {
  const [selectionOpen, setSelectionOpen] = useState(true);
  const children = blueprintChildrenAt(goals, screen.parentId);
  const path = screen.parentId ? findBlueprintPath(goals, screen.parentId) : [];
  const selected = selectedIds;
  const selectedNodes = selected.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));
  const currentParent = screen.parentId ? findGoal(goals, screen.parentId) : null;
  const parentOfCurrent = path.length > 1 ? path[path.length - 2] : null;
  const siblings = currentParent ? (parentOfCurrent?.children ?? goals) : [];
  const toggle = (id: string) => onSelectionChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const allSelected = children.length > 0 && children.every((node) => selected.includes(node.id));

  return (
    <div className="space-y-4">
      <StudioTitle eyebrow="Edit · Choose location" title="Where should Studio work?" copy="Open one branch at a time, then select exactly what you want to change." />
        <div className="no-swipe flex items-center gap-1.5 min-h-8 overflow-x-auto no-scrollbar">
        <button type="button" onClick={() => onScreen({ type: 'browse', parentId: null, pathIds: [], selectedIds: [] })} className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-full ${path.length === 0 ? 'bg-primary-soft text-primary' : 'text-content-muted bg-surface'}`}>All goals</button>
        {path.map((node, index) => (
          <div key={node.id} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight size={12} className="text-content-muted" />
            <button type="button" onClick={() => onScreen({ type: 'browse', parentId: node.id, pathIds: path.slice(0, index + 1).map((part) => part.id), selectedIds: [] })} className={`max-w-[9rem] truncate text-[11px] font-bold px-2.5 py-1.5 rounded-full ${index === path.length - 1 ? 'bg-primary-soft text-primary' : 'text-content-muted bg-surface'}`}>{node.title}</button>
          </div>
        ))}
      </div>
      {siblings.length > 1 && currentParent && (
        <div className="no-swipe -mt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-0.5">
          {siblings.map((node) => {
            const here = node.id === currentParent.id;
            const siblingPath = path.length > 1 ? [...path.slice(0, -1).map((part) => part.id), node.id] : [node.id];
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onScreen({ type: 'browse', parentId: node.id, pathIds: siblingPath, selectedIds: [] })}
                className={`shrink-0 max-w-[9.5rem] h-8 px-3 rounded-full text-[11px] font-semibold truncate border ${here ? 'bg-primary-soft text-primary border-primary/25' : 'bg-surface text-content-secondary border-subtle'}`}
              >
                {node.title}
              </button>
            );
          })}
        </div>
      )}
      {selectedNodes.length > 0 && (
        <div className="rounded-[14px] border border-primary/20 bg-primary-soft overflow-hidden fade-in">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Selected across blueprint</p>
              <p className="mt-0.5 text-[11.5px] text-content-secondary">{selectedNodes.length} item{selectedNodes.length === 1 ? '' : 's'} kept while you navigate</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSelectionOpen((value) => !value)} className="text-[11px] font-bold text-primary">{selectionOpen ? 'Hide' : 'Show'}</button>
              <button type="button" onClick={() => onSelectionChange([])} className="text-[11px] font-bold text-content-muted">Clear</button>
            </div>
          </div>
          {selectionOpen && <div className="no-swipe border-t border-primary/10 max-h-36 overflow-y-auto no-scrollbar divide-y divide-border-subtle bg-elevated/50">
            {selectedNodes.map((node) => {
              const path = findBlueprintPath(goals, node.id);
              const parentPath = path.slice(0, -1).map((part) => part.title).join(' / ') || 'Top level';
              return (
                <button key={node.id} type="button" onClick={() => toggle(node.id)} className="w-full min-h-[48px] px-3.5 py-2 flex items-center gap-3 text-left">
                  <span className="flex-1 min-w-0"><span className="block text-[11.5px] font-bold text-content-primary truncate">{node.title}</span><span className="block mt-0.5 text-[10px] text-content-muted truncate">{parentPath}</span></span>
                  <X size={13} className="text-content-muted shrink-0" />
                </button>
              );
            })}
          </div>}
        </div>
      )}
      <div className="rounded-[16px] border border-subtle bg-surface overflow-hidden">
        {children.length > 0 ? (
          <>
            <div className="px-3.5 py-2.5 border-b border-subtle flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-content-secondary">{selected.length ? `${selected.length} selected` : `${children.length} here`}</span>
              <button type="button" onClick={() => onSelectionChange(allSelected ? selected.filter((id) => !children.some((node) => node.id === id)) : [...new Set([...selected, ...children.map((node) => node.id)])])} className="text-[11px] font-bold text-primary">{allSelected ? 'Clear this level' : 'Select all here'}</button>
            </div>
            <div className="max-h-[48vh] overflow-y-auto no-scrollbar">
              {children.map((node, index) => {
                const active = selected.includes(node.id);
                return (
                  <div key={node.id} className={`min-h-[62px] flex items-center ${index < children.length - 1 ? 'border-b border-subtle' : ''} ${active ? 'bg-primary-soft' : ''}`}>
                    <button type="button" aria-label={`Select ${node.title}`} onClick={() => toggle(node.id)} className="w-12 self-stretch grid place-items-center shrink-0">
                      {active ? <CheckCircle2 size={20} className="text-primary" /> : <Circle size={20} className="text-content-muted" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => node.children.length > 0 ? onScreen({ type: 'browse', parentId: node.id, pathIds: [...screen.pathIds, node.id], selectedIds: [] }) : toggle(node.id)}
                      className="flex-1 min-w-0 self-stretch flex items-center gap-3 pr-3 text-left"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold text-content-primary truncate">{node.title}</span>
                        <span className="block mt-0.5 text-[10.5px] text-content-muted">{BLUEPRINT_LABELS[node.kind].singular}{node.children.length ? ` · ${node.children.length} inside` : ' · Empty shell'}</span>
                      </span>
                      {node.children.length > 0 && <ChevronRight size={17} className="text-content-muted shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="px-5 py-10 text-center">
            <Layers3 size={24} className="mx-auto text-content-muted" />
            <p className="mt-3 text-[13px] font-bold text-content-primary">This branch is an empty shell</p>
            <p className="mt-1 text-[12px] text-content-secondary">Go back and select it to build inside.</p>
          </div>
        )}
      </div>
      <StudioButton onClick={onContinue} disabled={selected.length === 0}>Choose an action <ArrowRight size={15} /></StudioButton>
    </div>
  );
}

function TreePreview({ goals }: { goals: GoalNode[] }) {
  const render = (nodes: GoalNode[], depth = 0): React.ReactNode => nodes.map((node) => (
    <div key={node.id}>
      <div className="min-h-9 flex items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 5) * 13}px` }}>
        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
        <span className="flex-1 min-w-0 text-[12px] font-semibold text-content-primary truncate">{node.title}</span>
        <span className="text-[9.5px] uppercase tracking-wider text-content-muted shrink-0">{BLUEPRINT_LABELS[node.kind].singular}</span>
      </div>
      {node.children.length > 0 && render(node.children, depth + 1)}
    </div>
  ));
  return <div>{render(goals)}</div>;
}

export default function BlueprintStudio({ open, goals, onClose, onCommit }: Props) {
  const [baseGoals, setBaseGoals] = useState<GoalNode[]>(goals);
  const [workingGoals, setWorkingGoals] = useState<GoalNode[]>(goals);
  const [screen, setScreen] = useState<Screen>({ type: 'home' });
  const [error, setError] = useState<string | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const historyRef = useRef<Snapshot[]>([]);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setBaseGoals(goals);
      setWorkingGoals(goals);
      setScreen({ type: 'home' });
      setError(null);
      setDiscardConfirm(false);
      setEditSelectedIds([]);
      historyRef.current = [];
    }
    wasOpenRef.current = open;
  }, [open, goals]);

  const move = (nextScreen: Screen, nextGoals = workingGoals) => {
    historyRef.current.push({ screen, goals: workingGoals });
    setWorkingGoals(nextGoals);
    setScreen(nextScreen);
    setError(null);
  };

  const replaceScreen = (nextScreen: Screen) => {
    setScreen(nextScreen);
    setError(null);
  };

  const goBack = () => {
    const previous = historyRef.current.pop();
    if (!previous) {
      if (screen.type === 'home') onClose();
      else setScreen({ type: 'home' });
      return;
    }
    setScreen(previous.screen);
    setWorkingGoals(previous.goals);
    setError(null);
  };

  const review = (summary: string, nextGoals = workingGoals) => move({ type: 'preview', summary }, nextGoals);

  const startQuestion = (parentIds: string[], candidate: Candidate, nextGoals = workingGoals) =>
    move({ type: 'question', parentIds, candidate }, nextGoals);

  const handleSkip = (parentIds: string[], candidate: Candidate) => {
    if (candidate === 'leaf' || candidate === 'steps') {
      review('Blueprint structure updated');
      return;
    }
    const next = nextCandidate(candidate);
    if (next) startQuestion(parentIds, next);
    else review('Blueprint structure updated');
  };

  const targetNodes = screen.type === 'actions' || screen.type === 'rename'
    ? screen.selectedIds.map((id) => findGoal(workingGoals, id)).filter((node): node is GoalNode => Boolean(node))
    : [];

  const baseCount = countBlueprintNodes(baseGoals);
  const nextCount = countBlueprintNodes(workingGoals);
  const nodeDelta = nextCount - baseCount;
  const hasDraftChanges = JSON.stringify(baseGoals) !== JSON.stringify(workingGoals);
  const requestClose = () => hasDraftChanges ? setDiscardConfirm(true) : onClose();
  const onStudioTouchStart = (event: React.TouchEvent) => {
    if (screen.type !== 'browse' || screen.pathIds.length === 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.no-swipe, input, textarea, select')) return;
    const touch = event.touches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onStudioTouchEnd = (event: React.TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || screen.type !== 'browse' || screen.pathIds.length === 0) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx >= 58 && Math.abs(dy) <= 46 && dx > Math.abs(dy) * 1.35) goBack();
  };

  if (!open) return null;

  return (
    <Overlay open={open} onClose={requestClose} align="full" scrim={false}>
      <div className="app-frame relative h-full w-full max-w-md mx-auto bg-base flex flex-col overflow-hidden border-x border-subtle blueprint-studio-shell">
        <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-subtle bg-surface/95">
          <div className="flex items-center gap-3">
            <button type="button" onClick={goBack} className="w-10 h-10 rounded-full grid place-items-center text-content-secondary bg-elevated border border-subtle active:scale-95" aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-[11px] grid place-items-center bg-primary-soft border border-primary/20 text-primary shrink-0">
              <Wand2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">YouDO</p>
              <h1 className="text-[15px] font-bold text-content-primary leading-tight">Blueprint Studio</h1>
            </div>
            {screen.type !== 'home' && screen.type !== 'preview' && hasDraftChanges && (
              <button type="button" onClick={() => review('Blueprint structure updated')} className="h-9 px-3 rounded-full text-[11px] font-bold text-primary bg-primary-soft border border-primary/15">Review</button>
            )}
            <button type="button" onClick={requestClose} className="w-9 h-9 rounded-full grid place-items-center text-content-muted hover:text-content-primary" aria-label="Close Blueprint Studio"><X size={18} /></button>
          </div>
          <div className="mt-3 h-0.5 rounded-full bg-border-subtle overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: screen.type === 'home' ? '12%' : screen.type === 'preview' ? '100%' : '52%' }} />
          </div>
        </header>

        <main onTouchStart={onStudioTouchStart} onTouchEnd={onStudioTouchEnd} className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div key={`${screen.type}-${historyRef.current.length}`} className="blueprint-step-in">
            {screen.type === 'home' && (
              <div className="space-y-6">
                <div className="relative overflow-hidden rounded-[20px] border border-primary/20 bg-elevated p-5 shadow-elevated">
                  <div className="absolute -right-10 -top-12 w-36 h-36 rounded-full bg-primary/10 blur-2xl" />
                  <div className="relative">
                    <span className="w-10 h-10 rounded-[12px] grid place-items-center bg-primary text-on-primary"><Sparkles size={19} /></span>
                    <h2 className="mt-5 text-[25px] leading-[1.08] tracking-[-0.04em] font-bold text-content-primary">Build the map.<br />Keep the work simple.</h2>
                    <p className="mt-3 text-[13px] leading-relaxed text-content-secondary">Studio helps you shape a goal one useful decision at a time—without forcing you to finish every branch today.</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <button type="button" onClick={() => move({ type: 'goal' })} className="w-full min-h-[94px] p-4 rounded-[16px] border border-subtle bg-surface flex items-center gap-4 text-left hover:border-primary/30 active:scale-[0.99]">
                    <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-primary-soft text-primary shrink-0"><Target size={21} /></span>
                    <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold text-content-primary">Create a blueprint</span><span className="block mt-1 text-[12px] leading-relaxed text-content-secondary">Start with an outcome and add only the layers that help.</span></span>
                    <ChevronRight size={18} className="text-content-muted shrink-0" />
                  </button>
                  <button type="button" onClick={() => { setEditSelectedIds([]); move({ type: 'browse', parentId: null, pathIds: [], selectedIds: [] }); }} disabled={goals.length === 0} className="w-full min-h-[94px] p-4 rounded-[16px] border border-subtle bg-surface flex items-center gap-4 text-left hover:border-primary/30 active:scale-[0.99] disabled:opacity-40">
                    <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-elevated text-content-secondary shrink-0"><FilePenLine size={21} /></span>
                    <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold text-content-primary">Edit existing</span><span className="block mt-1 text-[12px] leading-relaxed text-content-secondary">Open one branch, select the scope, then make a focused change.</span></span>
                    <span className="shrink-0 text-[11px] font-bold text-content-muted">{goals.length || 'None'}</span>
                  </button>
                </div>
                <p className="px-2 text-center text-[11px] leading-relaxed text-content-muted">Nothing changes until you review and confirm. Every Studio change can be undone.</p>
              </div>
            )}

            {screen.type === 'goal' && (
              <GoalStarter onContinue={(value) => {
                const root = { ...makeBlueprintNode('goal', value.title), description: value.description, startDate: value.startDate, endDate: value.endDate };
                const nextGoals = [...workingGoals, root];
                move({ type: 'question', parentIds: [root.id], candidate: 'phase' }, nextGoals);
              }} />
            )}

            {screen.type === 'question' && (() => {
              const label = candidateLabel(screen.candidate);
              const parentNames = screen.parentIds.map((id) => findGoal(workingGoals, id)?.title).filter(Boolean);
              const context = parentNames.length === 1 ? parentNames[0] : `${parentNames.length} selected branches`;
              return (
                <div className="space-y-5">
                  <StudioTitle
                    eyebrow={`Shape · ${context}`}
                    title={candidateQuestion(screen.candidate)}
                    copy={screen.parentIds.length > 1 ? `Your choice applies to all ${screen.parentIds.length} selected branches.` : `Add this layer only if it makes “${context}” easier to understand and use.`}
                  />
                  <div className="space-y-2.5">
                    <button type="button" onClick={() => move({ type: 'items', parentIds: screen.parentIds, candidate: screen.candidate })} className="w-full min-h-[82px] p-4 rounded-[16px] border border-primary/25 bg-primary-soft flex items-center gap-3 text-left active:scale-[0.99]">
                      <span className="w-10 h-10 rounded-full bg-primary text-on-primary grid place-items-center shrink-0"><Plus size={18} /></span>
                      <span className="flex-1"><span className="block text-[14px] font-bold text-content-primary">Yes, add {label.plural}</span><span className="block mt-1 text-[11.5px] text-content-secondary">Type names, paste a list, or create a numbered range</span></span>
                      <ChevronRight size={17} className="text-primary" />
                    </button>
                    <button type="button" onClick={() => handleSkip(screen.parentIds, screen.candidate)} className="w-full min-h-[72px] p-4 rounded-[16px] border border-subtle bg-surface flex items-center gap-3 text-left active:scale-[0.99]">
                      <span className="w-10 h-10 rounded-full bg-elevated text-content-secondary grid place-items-center shrink-0"><ArrowRight size={17} /></span>
                      <span className="flex-1"><span className="block text-[13px] font-bold text-content-primary">No, skip this layer</span><span className="block mt-1 text-[11.5px] text-content-muted">Continue without adding unnecessary structure</span></span>
                    </button>
                  </div>
                  <ExampleHint candidate={screen.candidate} />
                </div>
              );
            })()}

            {screen.type === 'items' && (
              <ItemComposer candidate={screen.candidate} parentCount={screen.parentIds.length} onContinue={(titles) => {
                if (screen.candidate === 'steps') {
                  const result = addBlueprintSteps(workingGoals, screen.parentIds, titles);
                  if (result.added === 0) { setError('Those steps already exist here. Add a different step or go back.'); return; }
                  review(`Added ${result.added} step${result.added === 1 ? '' : 's'} across ${result.affected} leaf task${result.affected === 1 ? '' : 's'}`, result.goals);
                  return;
                }
                const result = addBlueprintChildren(workingGoals, screen.parentIds, screen.candidate, titles);
                if (result.added === 0) { setError('Those names already exist here. Add different names or go back.'); return; }
                move({ type: 'branches', createdIds: result.createdIds, kind: screen.candidate }, result.goals);
              }} />
            )}

            {screen.type === 'branches' && (
              <BranchChooser goals={workingGoals} nodeIds={screen.createdIds} kind={screen.kind} onContinue={(ids) => {
                const next = nextCandidate(screen.kind);
                if (next) startQuestion(ids, next);
                else review(`Added ${screen.createdIds.length} ${BLUEPRINT_LABELS[screen.kind].plural}`);
              }} onFinish={() => review(`Added ${screen.createdIds.length} ${BLUEPRINT_LABELS[screen.kind].plural}`)} />
            )}

            {screen.type === 'browse' && (
              <BrowseTree goals={workingGoals} screen={screen} selectedIds={editSelectedIds} onSelectionChange={setEditSelectedIds} onScreen={(next) => {
                if (next.parentId !== screen.parentId) move(next);
                else replaceScreen(next);
              }} onContinue={() => move({ type: 'actions', selectedIds: editSelectedIds, returnBrowse: screen })} />
            )}

            {screen.type === 'actions' && (() => {
              const kinds = new Set(targetNodes.map((node) => node.kind));
              const sameKind = kinds.size === 1;
              const firstKind = targetNodes[0]?.kind;
              const next = firstKind ? nextKindAfter(firstKind) : null;
              const operation = (icon: React.ReactNode, title: string, copy: string, action: () => void, danger = false) => (
                <button type="button" onClick={action} className={`w-full min-h-[76px] p-3.5 rounded-[15px] border flex items-center gap-3 text-left active:scale-[0.99] ${danger ? 'border-error/20 bg-error-soft' : 'border-subtle bg-surface'}`}>
                  <span className={`w-10 h-10 rounded-[12px] grid place-items-center shrink-0 ${danger ? 'bg-error/10 text-error' : 'bg-elevated text-primary'}`}>{icon}</span>
                  <span className="flex-1 min-w-0"><span className={`block text-[13.5px] font-bold ${danger ? 'text-error' : 'text-content-primary'}`}>{title}</span><span className="block mt-1 text-[11.5px] leading-relaxed text-content-secondary">{copy}</span></span>
                  <ChevronRight size={16} className="text-content-muted shrink-0" />
                </button>
              );
              return (
                <div className="space-y-5">
                  <StudioTitle eyebrow={`Edit · ${targetNodes.length} selected`} title="What should change?" copy="Studio only shows actions that make sense for this selection." />
                  <div className="rounded-[12px] bg-primary-soft border border-primary/15 px-3.5 py-3 text-[12px] text-content-secondary line-clamp-2">{targetNodes.slice(0, 4).map((node) => node.title).join(' · ')}{targetNodes.length > 4 ? ` · +${targetNodes.length - 4}` : ''}</div>
                  <div className="space-y-2.5">
                    {sameKind && next && operation(next === 'steps' ? <ListTree size={18} /> : <ListPlus size={18} />, next === 'steps' ? 'Add repeatable steps' : 'Build inside', next === 'steps' ? 'Append the same missing steps to every selected leaf task.' : `Add the same structure to ${targetNodes.length === 1 ? 'this branch' : 'all selected branches'}, then choose how deep to continue.`, () => startQuestion(screen.selectedIds, next))}
                    {operation(<FilePenLine size={18} />, targetNodes.length === 1 ? 'Rename or edit details' : 'Rename selected', targetNodes.length === 1 ? 'Change its name, description, or dates.' : 'Give each selected item a clear new name.', () => move(targetNodes.length === 1 ? { type: 'details', nodeId: targetNodes[0].id } : { type: 'rename', selectedIds: screen.selectedIds }))}
                    {operation(<Trash2 size={18} />, `Remove ${targetNodes.length === 1 ? 'this branch' : 'selected branches'}`, 'Preview the result first. Linked Today copies are removed with the branch.', () => {
                      const nextGoals = removeBlueprintNodes(workingGoals, screen.selectedIds);
                      review(`Removed ${targetNodes.length} branch${targetNodes.length === 1 ? '' : 'es'}`, nextGoals);
                    }, true)}
                  </div>
                  {!sameKind && <p className="text-[11px] text-content-muted text-center">Mixed levels can be renamed or removed together. Select one level at a time to build inside.</p>}
                </div>
              );
            })()}

            {screen.type === 'rename' && (
              <RenameEditor nodes={targetNodes} onContinue={(titles) => review(`Renamed ${Object.keys(titles).length} item${Object.keys(titles).length === 1 ? '' : 's'}`, renameBlueprintNodes(workingGoals, titles))} />
            )}

            {screen.type === 'details' && (() => {
              const node = findGoal(workingGoals, screen.nodeId);
              return node ? <DetailsEditor node={node} onContinue={(patch) => {
                const renamed = renameBlueprintNodes(workingGoals, { [node.id]: patch.title });
                const nextGoals = renamed.map((root) => root.id === node.id ? { ...root, ...patch } : updateDetails(root, node.id, patch));
                review(`Updated ${patch.title}`, nextGoals);
              }} /> : null;
            })()}

            {screen.type === 'preview' && (
              <div className="space-y-5">
                <StudioTitle eyebrow="Review · Nothing saved yet" title="A clear blueprint, before you commit." copy="Check the shape now. You can go back, or apply everything as one safe change." />
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[14px] bg-elevated border border-subtle p-3"><p className={`text-[19px] font-bold tabular-nums ${nodeDelta < 0 ? 'text-error' : 'text-primary'}`}>{nodeDelta > 0 ? '+' : ''}{nodeDelta}</p><p className="mt-1 text-[10px] uppercase tracking-wider font-bold text-content-muted">Items</p></div>
                  <div className="rounded-[14px] bg-elevated border border-subtle p-3"><p className="text-[19px] font-bold tabular-nums text-content-primary">{nextCount}</p><p className="mt-1 text-[10px] uppercase tracking-wider font-bold text-content-muted">Total</p></div>
                  <div className="rounded-[14px] bg-elevated border border-subtle p-3"><p className="text-[19px] font-bold tabular-nums text-content-primary">{maxBlueprintDepth(workingGoals)}</p><p className="mt-1 text-[10px] uppercase tracking-wider font-bold text-content-muted">Levels</p></div>
                </div>
                <div className="rounded-[16px] border border-primary/20 bg-primary-soft p-4 flex items-start gap-3">
                  <CheckCircle2 size={19} className="text-primary shrink-0 mt-0.5" />
                  <div><p className="text-[13px] font-bold text-content-primary">{screen.summary}</p><p className="mt-1 text-[11.5px] leading-relaxed text-content-secondary">Existing completion and scheduling are preserved unless their branch was intentionally removed.</p></div>
                </div>
                <details className="rounded-[16px] border border-subtle bg-surface overflow-hidden">
                  <summary className="min-h-12 px-4 flex items-center justify-between cursor-pointer text-[12px] font-bold text-content-primary">Review structure <span className="text-content-muted">{nextCount} items</span></summary>
                  <div className="border-t border-subtle px-3.5 py-2 max-h-[38vh] overflow-y-auto no-scrollbar"><TreePreview goals={workingGoals} /></div>
                </details>
                <div className="grid grid-cols-1 gap-2">
                  <StudioButton onClick={() => {
                    const result = onCommit(baseGoals, workingGoals, screen.summary);
                    if (result.ok) onClose();
                    else if (result.error === 'stale') setError('Your goals changed while Studio was open. Close and reopen Studio so nothing newer is overwritten.');
                    else if (result.error === 'active-session') setError('One removed branch has a focus session running. Stop or save that session before removing the branch.');
                    else setError('There is nothing new to apply.');
                  }} disabled={nodeDelta === 0 && JSON.stringify(baseGoals) === JSON.stringify(workingGoals)}>
                    Apply blueprint <Check size={16} />
                  </StudioButton>
                  <StudioButton onClick={goBack} variant="quiet"><RotateCcw size={14} /> Keep editing</StudioButton>
                </div>
              </div>
            )}

            {error && <div role="alert" className="mt-4 rounded-[12px] border border-error/20 bg-error-soft px-3.5 py-3 text-[12px] leading-relaxed text-error fade-in">{error}</div>}
          </div>
        </main>
        {discardConfirm && (
          <div className="absolute inset-0 z-20 bg-[var(--backdrop)] backdrop-blur-md grid place-items-center p-5 fade-in">
            <div className="w-full max-w-sm rounded-[18px] border border-subtle bg-elevated p-5 shadow-elevated">
              <div className="w-10 h-10 rounded-[12px] bg-error-soft text-error grid place-items-center"><X size={18} /></div>
              <h2 className="mt-4 text-[18px] font-bold text-content-primary">Leave this draft?</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-content-secondary">Nothing has been applied yet. Leaving now discards the blueprint changes in Studio.</p>
              <div className="mt-5 grid grid-cols-1 gap-2">
                <StudioButton onClick={() => setDiscardConfirm(false)}>Keep building</StudioButton>
                <StudioButton onClick={onClose} variant="danger">Discard draft</StudioButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function RenameEditor({ nodes, onContinue }: { nodes: GoalNode[]; onContinue: (titles: Record<string, string>) => void }) {
  const [titles, setTitles] = useState<Record<string, string>>(() => Object.fromEntries(nodes.map((node) => [node.id, node.title])));
  const valid = nodes.every((node) => titles[node.id]?.trim());
  return (
    <div className="space-y-5">
      <StudioTitle eyebrow="Edit · Names" title="Make every label clear." copy="Change only what needs changing. The structure underneath stays untouched." />
      <div className="rounded-[16px] border border-subtle bg-surface divide-y divide-border-subtle max-h-[52vh] overflow-y-auto no-scrollbar">
        {nodes.map((node) => <label key={node.id} className="block p-3.5"><span className="block text-[10px] uppercase tracking-wider font-bold text-content-muted">{BLUEPRINT_LABELS[node.kind].singular}</span><input value={titles[node.id] ?? ''} onChange={(event) => setTitles((current) => ({ ...current, [node.id]: event.target.value }))} className="mt-1.5 w-full h-11 bg-elevated border border-subtle rounded-[10px] px-3 text-[13px] font-semibold text-content-primary outline-none focus:border-primary" /></label>)}
      </div>
      <StudioButton onClick={() => onContinue(titles)} disabled={!valid}>Review names <ArrowRight size={15} /></StudioButton>
    </div>
  );
}

function DetailsEditor({ node, onContinue }: { node: GoalNode; onContinue: (patch: Pick<GoalNode, 'title' | 'description' | 'startDate' | 'endDate'>) => void }) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? '');
  const [startDate, setStartDate] = useState(node.startDate ?? '');
  const [endDate, setEndDate] = useState(node.endDate ?? '');
  return (
    <div className="space-y-5">
      <StudioTitle eyebrow={`Edit · ${BLUEPRINT_LABELS[node.kind].singular}`} title="Refine this branch." copy="Its children, progress, and scheduled work stay connected." />
      <div className="rounded-[16px] border border-subtle bg-elevated p-4 space-y-4">
        <label className="block text-[10px] uppercase tracking-wider font-bold text-content-muted">Name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-3 text-[13px] font-semibold text-content-primary outline-none focus:border-primary" /></label>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-content-muted">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Optional context" className="mt-1.5 w-full bg-base border border-subtle rounded-[10px] px-3 py-2.5 text-[13px] text-content-primary outline-none focus:border-primary resize-none" /></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Start<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-2 text-[12px] text-content-primary outline-none focus:border-primary" /></label><label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Finish<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-2 text-[12px] text-content-primary outline-none focus:border-primary" /></label></div>
      </div>
      <StudioButton onClick={() => onContinue({ title: title.trim(), description: description.trim() || undefined, startDate: startDate || undefined, endDate: endDate || undefined })} disabled={!title.trim()}>Review changes <ArrowRight size={15} /></StudioButton>
    </div>
  );
}

function updateDetails(root: GoalNode, id: string, patch: Pick<GoalNode, 'title' | 'description' | 'startDate' | 'endDate'>): GoalNode {
  if (root.id === id) return { ...root, ...patch };
  let changed = false;
  const children = root.children.map((child) => {
    const next = updateDetails(child, id, patch);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}
