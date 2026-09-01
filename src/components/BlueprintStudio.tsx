import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FilePenLine,
  Layers3,
  ListPlus,
  ListTree,
  Minus,
  Plus,
  RotateCcw,
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
  blueprintReviewState,
  closestBlueprintPathIds,
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
  | { type: 'goal'; returnBrowse: BrowseScreen }
  | { type: 'items'; parentIds: string[]; candidate: Candidate; returnBrowse: BrowseScreen }
  | { type: 'browse'; parentId: string | null; pathIds: string[]; selectedIds: string[] }
  | { type: 'actions'; selectedIds: string[]; returnBrowse: Extract<Screen, { type: 'browse' }>; allowBuildInside: boolean }
  | { type: 'rename'; selectedIds: string[]; returnBrowse: BrowseScreen }
  | { type: 'details'; nodeId: string; returnBrowse: BrowseScreen }
  | { type: 'preview'; summary: string };

type BrowseScreen = Extract<Screen, { type: 'browse' }>;

interface DraftChange {
  id: number;
  summary: string;
  beforeGoals: GoalNode[];
}

interface Props {
  open: boolean;
  goals: GoalNode[];
  initialPathIds?: string[];
  onClose: () => void;
  onCommit: (baseGoals: GoalNode[], nextGoals: GoalNode[], summary: string) => GoalTreeChangeResult;
}

const rootBrowse = (): BrowseScreen => ({ type: 'browse', parentId: null, pathIds: [], selectedIds: [] });

function browseAt(goals: GoalNode[], requestedPath: string[] = []): BrowseScreen {
  const pathIds = closestBlueprintPathIds(goals, requestedPath);
  return pathIds.length > 0
    ? { type: 'browse', parentId: pathIds[pathIds.length - 1], pathIds, selectedIds: [] }
    : rootBrowse();
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
        eyebrow="New goal"
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
        Apply goal <Check size={15} />
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
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('1');
  const [count, setCount] = useState('5');
  const numberedPlaceholder = candidate === 'steps' ? 'Step' : label.singular.replace(/^./, (letter) => letter.toUpperCase());
  const names = useMemo(
    () => {
      if (mode === 'names') return normalizeBlueprintTitles(text.split(/\r?\n|,/));
      if (!prefix.trim() || start.trim() === '' || count.trim() === '') return [];
      const startNumber = Number(start);
      const countNumber = Number(count);
      if (!Number.isFinite(startNumber) || !Number.isFinite(countNumber) || startNumber < 0 || countNumber < 1) return [];
      return numberedBlueprintTitles(prefix, startNumber, countNumber);
    },
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
            <input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder={numberedPlaceholder} className="w-full h-11 bg-base border border-subtle rounded-[12px] px-3.5 text-[14px] font-semibold text-content-primary placeholder:text-content-muted outline-none focus:border-primary" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Start at<input type="number" inputMode="numeric" min={0} max={999} value={start} onChange={(event) => setStart(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-3 text-[14px] text-content-primary outline-none focus:border-primary" /></label>
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-muted">How many<input type="number" inputMode="numeric" min={1} max={100} value={count} onChange={(event) => setCount(event.target.value)} className="mt-1.5 w-full h-11 bg-base border border-subtle rounded-[10px] px-3 text-[14px] text-content-primary outline-none focus:border-primary" /></label>
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
        Apply {names.length || ''} {names.length === 1 ? label.singular : label.plural} <Check size={15} />
      </StudioButton>
    </div>
  );
}

function BrowseTree({
  goals,
  screen,
  selectedIds,
  onScreen,
  onSelectionChange,
  onOpenActions,
  onAdd,
}: {
  goals: GoalNode[];
  screen: Extract<Screen, { type: 'browse' }>;
  selectedIds: string[];
  onScreen: (screen: Extract<Screen, { type: 'browse' }>) => void;
  onSelectionChange: (ids: string[]) => void;
  onOpenActions: (ids: string[], allowBuildInside: boolean) => void;
  onAdd: (parent: GoalNode | null) => void;
}) {
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(selectedIds.length > 0);
  const children = blueprintChildrenAt(goals, screen.parentId);
  const path = screen.parentId ? findBlueprintPath(goals, screen.parentId) : [];
  const selected = selectedIds;
  const selectedNodes = selected.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));
  const currentParent = screen.parentId ? findGoal(goals, screen.parentId) : null;
  const parentOfCurrent = path.length > 1 ? path[path.length - 2] : null;
  const siblings = currentParent ? (parentOfCurrent?.children ?? goals) : [];
  const toggle = (id: string) => onSelectionChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const allSelected = children.length > 0 && children.every((node) => selected.includes(node.id));
  const steps = currentParent?.kind === 'leaf' ? currentParent.steps ?? [] : [];
  const insideCount = currentParent?.kind === 'leaf' ? steps.length : children.length;
  const next = currentParent ? nextKindAfter(currentParent.kind) : null;
  const addLabel = !currentParent
    ? 'Add goal'
    : next === 'steps'
      ? 'Add steps'
      : next
        ? `Add ${BLUEPRINT_LABELS[next].plural}`
        : null;

  return (
    <div className="space-y-3.5">
      <div className="no-swipe flex items-center gap-1.5 min-h-8 overflow-x-auto no-scrollbar">
        <button type="button" onClick={() => onScreen({ type: 'browse', parentId: null, pathIds: [], selectedIds: [] })} className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-full ${path.length === 0 ? 'bg-primary-soft text-primary' : 'text-content-muted bg-surface'}`}>All goals</button>
        {path.map((node, index) => (
          <div key={node.id} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight size={12} className="text-content-muted" />
            <button type="button" onClick={() => onScreen({ type: 'browse', parentId: node.id, pathIds: path.slice(0, index + 1).map((part) => part.id), selectedIds: [] })} className={`max-w-[9rem] truncate text-[11px] font-bold px-2.5 py-1.5 rounded-full ${index === path.length - 1 ? 'bg-primary-soft text-primary' : 'text-content-muted bg-surface'}`}>{node.title}</button>
          </div>
        ))}
      </div>
      <section className="rounded-[16px] border border-subtle bg-elevated px-4 py-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-[11px] grid place-items-center bg-primary-soft text-primary shrink-0">
            {currentParent ? <Layers3 size={17} /> : <Target size={17} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-primary">{currentParent ? BLUEPRINT_LABELS[currentParent.kind].singular : 'Blueprint'}</p>
            <h2 className="mt-0.5 text-[16px] leading-tight font-bold text-content-primary truncate">{currentParent?.title ?? 'Your goals'}</h2>
            <p className="mt-0.5 text-[10.5px] text-content-muted">{insideCount} {currentParent?.kind === 'leaf' ? 'step' : 'item'}{insideCount === 1 ? '' : 's'} inside</p>
          </div>
          {currentParent && (
            <button type="button" onClick={() => onOpenActions([currentParent.id], false)} className="h-9 px-3 rounded-[10px] border border-subtle bg-surface text-[11px] font-bold text-content-secondary" aria-label={`Edit ${currentParent.title}`}>Edit</button>
          )}
        </div>
        {addLabel && (
          <button type="button" onClick={() => onAdd(currentParent)} className="mt-3 w-full h-10 rounded-[11px] bg-primary-soft border border-primary/20 text-primary text-[12px] font-bold inline-flex items-center justify-center gap-2">
            <Plus size={15} /> {addLabel}
          </button>
        )}
      </section>
      {siblings.length > 1 && currentParent && (
        <div className="no-swipe flex items-center gap-1.5 overflow-x-auto no-scrollbar px-0.5">
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Selection kept</p>
              <p className="mt-0.5 text-[11.5px] text-content-secondary">{selectedNodes.length} item{selectedNodes.length === 1 ? '' : 's'} across the blueprint</p>
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
              <span className="text-[11px] font-semibold text-content-secondary">{selectionMode ? `${selected.length} selected` : 'Inside this branch'}</span>
              {selectionMode ? (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => onSelectionChange(allSelected ? selected.filter((id) => !children.some((node) => node.id === id)) : [...new Set([...selected, ...children.map((node) => node.id)])])} className="text-[11px] font-bold text-primary">{allSelected ? 'Clear level' : 'Select all'}</button>
                  <button type="button" onClick={() => setSelectionMode(false)} className="text-[11px] font-bold text-content-secondary">Finish selecting</button>
                </div>
              ) : (
                <button type="button" onClick={() => setSelectionMode(true)} className="text-[11px] font-bold text-primary">Select</button>
              )}
            </div>
            <div className="max-h-[48vh] overflow-y-auto no-scrollbar">
              {children.map((node, index) => {
                const active = selected.includes(node.id);
                return (
                  <div key={node.id} className={`min-h-[62px] flex items-center ${index < children.length - 1 ? 'border-b border-subtle' : ''} ${active ? 'bg-primary-soft' : ''}`}>
                    {selectionMode ? (
                      <button type="button" aria-label={`Select ${node.title}`} onClick={() => toggle(node.id)} className="w-12 self-stretch grid place-items-center shrink-0">
                        {active ? <CheckCircle2 size={20} className="text-primary" /> : <Circle size={20} className="text-content-muted" />}
                      </button>
                    ) : (
                      <span className="w-12 self-stretch grid place-items-center shrink-0"><span className="w-2 h-2 rounded-full bg-primary/70" /></span>
                    )}
                    <button
                      type="button"
                      onClick={() => selectionMode ? toggle(node.id) : onScreen({ type: 'browse', parentId: node.id, pathIds: [...screen.pathIds, node.id], selectedIds: [] })}
                      className="flex-1 min-w-0 self-stretch flex items-center gap-3 pr-3 text-left"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold text-content-primary truncate">{node.title}</span>
                        <span className="block mt-0.5 text-[10.5px] text-content-muted">{BLUEPRINT_LABELS[node.kind].singular}{node.children.length ? ` · ${node.children.length} inside` : ' · Empty shell'}</span>
                      </span>
                      {!selectionMode && <ChevronRight size={17} className="text-content-muted shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : steps.length > 0 ? (
          <div>
            <div className="px-3.5 py-2.5 border-b border-subtle text-[11px] font-semibold text-content-secondary">Steps inside this leaf task</div>
            <ol className="divide-y divide-border-subtle">
              {steps.map((step, index) => (
                <li key={`${step}-${index}`} className="min-h-[48px] px-3.5 py-2 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary-soft text-primary grid place-items-center text-[10px] font-bold shrink-0">{index + 1}</span>
                  <span className="text-[12.5px] font-semibold text-content-primary">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <Layers3 size={24} className="mx-auto text-content-muted" />
            <p className="mt-3 text-[13px] font-bold text-content-primary">This branch is an empty shell</p>
            <p className="mt-1 text-[12px] text-content-secondary">Use the button above when you are ready to build inside it.</p>
          </div>
        )}
      </div>
      {selected.length > 0 && <StudioButton onClick={() => onOpenActions(selected, true)}>Edit {selected.length} selected <ArrowRight size={15} /></StudioButton>}
    </div>
  );
}

function TreePreview({ goals, review }: { goals: GoalNode[]; review: ReturnType<typeof blueprintReviewState> }) {
  const addedIds = new Set(review.addedIds);
  const changedIds = new Set(review.changedIds);
  const expandedIds = new Set(review.expandedIds);
  const render = (nodes: GoalNode[], depth = 0): React.ReactNode => nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const hasSteps = node.kind === 'leaf' && (node.steps?.length ?? 0) > 0;
    const hasInside = hasChildren || hasSteps;
    const isAdded = addedIds.has(node.id);
    const isChanged = changedIds.has(node.id);
    const row = (
      <div className={`min-h-10 flex items-center gap-2.5 pr-2 ${isAdded || isChanged ? 'bg-primary-soft/55' : ''}`} style={{ paddingLeft: `${Math.min(depth, 5) * 12 + 8}px` }}>
        {hasInside ? (
          <ChevronRight size={14} className="tree-preview-chevron text-content-muted shrink-0 transition-transform" />
        ) : (
          <span className="w-3.5 grid place-items-center shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-primary/70" /></span>
        )}
        <span className="flex-1 min-w-0 text-[12px] font-semibold text-content-primary truncate">{node.title}</span>
        {isAdded && <span className="text-[8.5px] uppercase tracking-wider font-bold text-primary shrink-0">New</span>}
        {!isAdded && isChanged && <span className="text-[8.5px] uppercase tracking-wider font-bold text-primary shrink-0">Changed</span>}
        {hasInside && <span className="text-[10px] tabular-nums text-content-muted shrink-0">{hasChildren ? node.children.length : node.steps?.length ?? 0}</span>}
        <span className="text-[9px] uppercase tracking-wider text-content-muted shrink-0">{BLUEPRINT_LABELS[node.kind].singular}</span>
      </div>
    );

    if (!hasInside) return <div key={node.id} className="border-b border-subtle last:border-b-0">{row}</div>;
    return (
      <details key={node.id} open={expandedIds.has(node.id)} className="tree-preview-branch border-b border-subtle last:border-b-0">
        <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">{row}</summary>
        <div className="border-t border-subtle bg-elevated/35">
          {hasChildren ? render(node.children, depth + 1) : (
            <ol className="divide-y divide-border-subtle">
              {(node.steps ?? []).map((step, index) => {
                const isNewStep = review.addedStepsByNode[node.id]?.includes(step) ?? false;
                return (
                  <li key={`${node.id}-${step}-${index}`} className={`min-h-9 flex items-center gap-2 pr-3 text-[11px] ${isNewStep ? 'bg-primary-soft/45 text-content-primary' : 'text-content-secondary'}`} style={{ paddingLeft: `${Math.min(depth + 1, 5) * 12 + 22}px` }}>
                    <span className="w-4 h-4 rounded-full bg-elevated border border-subtle grid place-items-center text-[8px] tabular-nums shrink-0">{index + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{step}</span>
                    {isNewStep && <span className="text-[8.5px] uppercase tracking-wider font-bold text-primary shrink-0">New</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </details>
    );
  });
  return <div className="overflow-hidden">{render(goals)}</div>;
}

export default function BlueprintStudio({ open, goals, initialPathIds = [], onClose, onCommit }: Props) {
  const [baseGoals, setBaseGoals] = useState<GoalNode[]>(goals);
  const [workingGoals, setWorkingGoals] = useState<GoalNode[]>(goals);
  const [screen, setScreen] = useState<Screen>(() => browseAt(goals, initialPathIds));
  const [error, setError] = useState<string | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [draftChanges, setDraftChanges] = useState<DraftChange[]>([]);
  const [draftHistoryOpen, setDraftHistoryOpen] = useState(false);
  const historyRef = useRef<Screen[]>([]);
  const changeIdRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setBaseGoals(goals);
      setWorkingGoals(goals);
      setScreen(browseAt(goals, initialPathIds));
      setError(null);
      setDiscardConfirm(false);
      setEditSelectedIds([]);
      setDraftChanges([]);
      setDraftHistoryOpen(false);
      historyRef.current = [];
    }
    wasOpenRef.current = open;
  }, [open, goals, initialPathIds]);

  const move = (nextScreen: Screen) => {
    historyRef.current.push(screen);
    setScreen(nextScreen);
    setError(null);
  };

  const replaceScreen = (nextScreen: Screen) => {
    setScreen(nextScreen);
    setError(null);
  };

  const goBack = () => {
    if (screen.type === 'browse' && screen.pathIds.length > 0) {
      const parentPath = screen.pathIds.slice(0, -1);
      setScreen({ type: 'browse', parentId: parentPath[parentPath.length - 1] ?? null, pathIds: parentPath, selectedIds: [] });
      setError(null);
      return;
    }
    const previous = historyRef.current.pop();
    if (!previous) {
      if (screen.type === 'browse') {
        if (JSON.stringify(baseGoals) !== JSON.stringify(workingGoals)) setDiscardConfirm(true);
        else onClose();
      }
      else setScreen(rootBrowse());
      return;
    }
    setScreen(previous);
    setError(null);
  };

  const review = () => move({ type: 'preview', summary: `${draftChanges.length} draft change${draftChanges.length === 1 ? '' : 's'}` });

  const startItems = (parentIds: string[], candidate: Candidate, returnBrowse: BrowseScreen) =>
    move({ type: 'items', parentIds, candidate, returnBrowse });

  const applyToDraft = (summary: string, nextGoals: GoalNode[], returnBrowse: BrowseScreen) => {
    if (JSON.stringify(nextGoals) === JSON.stringify(workingGoals)) {
      setError('There is nothing new to apply.');
      return;
    }
    changeIdRef.current += 1;
    setDraftChanges((current) => [...current, { id: changeIdRef.current, summary, beforeGoals: workingGoals }]);
    setWorkingGoals(nextGoals);
    setEditSelectedIds([]);
    historyRef.current = [];
    setScreen(returnBrowse);
    setError(null);
  };

  const undoDraftChange = () => {
    const latest = draftChanges[draftChanges.length - 1];
    if (!latest) return;
    setWorkingGoals(latest.beforeGoals);
    setDraftChanges((current) => current.slice(0, -1));
    setEditSelectedIds([]);
    setScreen((current) => current.type === 'browse' ? browseAt(latest.beforeGoals, current.pathIds) : rootBrowse());
    setError(null);
  };

  const targetNodes = screen.type === 'actions' || screen.type === 'rename'
    ? screen.selectedIds.map((id) => findGoal(workingGoals, id)).filter((node): node is GoalNode => Boolean(node))
    : [];

  const baseCount = countBlueprintNodes(baseGoals);
  const nextCount = countBlueprintNodes(workingGoals);
  const nodeDelta = nextCount - baseCount;
  const reviewState = useMemo(() => blueprintReviewState(baseGoals, workingGoals), [baseGoals, workingGoals]);
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
            <button type="button" onClick={requestClose} className="w-9 h-9 rounded-full grid place-items-center text-content-muted hover:text-content-primary" aria-label="Close Blueprint Studio"><X size={18} /></button>
          </div>
        </header>

        <main onTouchStart={onStudioTouchStart} onTouchEnd={onStudioTouchEnd} className={`flex-1 overflow-y-auto overscroll-contain no-scrollbar px-4 py-4 ${hasDraftChanges ? 'pb-28' : 'pb-[max(2rem,env(safe-area-inset-bottom))]'}`}>
          <div key={`${screen.type}-${historyRef.current.length}`} className="blueprint-step-in">
            {screen.type === 'goal' && (
              <GoalStarter onContinue={(value) => {
                const root = { ...makeBlueprintNode('goal', value.title), description: value.description, startDate: value.startDate, endDate: value.endDate };
                const nextGoals = [...workingGoals, root];
                applyToDraft(`Created goal “${root.title}”`, nextGoals, browseAt(nextGoals, [root.id]));
              }} />
            )}

            {screen.type === 'items' && (
              <ItemComposer candidate={screen.candidate} parentCount={screen.parentIds.length} onContinue={(titles) => {
                if (screen.candidate === 'steps') {
                  const result = addBlueprintSteps(workingGoals, screen.parentIds, titles);
                  if (result.added === 0) { setError('Those steps already exist here. Add a different step or go back.'); return; }
                  applyToDraft(`Added ${result.added} step${result.added === 1 ? '' : 's'} across ${result.affected} leaf task${result.affected === 1 ? '' : 's'}`, result.goals, screen.returnBrowse);
                  return;
                }
                const result = addBlueprintChildren(workingGoals, screen.parentIds, screen.candidate, titles);
                if (result.added === 0) { setError('Those names already exist here. Add different names or go back.'); return; }
                applyToDraft(`Added ${result.added} ${result.added === 1 ? candidateLabel(screen.candidate).singular : candidateLabel(screen.candidate).plural}`, result.goals, screen.returnBrowse);
              }} />
            )}

            {screen.type === 'browse' && (
              <BrowseTree goals={workingGoals} screen={screen} selectedIds={editSelectedIds} onSelectionChange={setEditSelectedIds} onScreen={(next) => {
                replaceScreen(next);
              }} onOpenActions={(ids, allowBuildInside) => move({ type: 'actions', selectedIds: ids, returnBrowse: screen, allowBuildInside })} onAdd={(parent) => {
                if (!parent) {
                  move({ type: 'goal', returnBrowse: screen });
                  return;
                }
                const next = nextKindAfter(parent.kind);
                if (next) startItems([parent.id], next, screen);
              }} />
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
                  <StudioTitle
                    eyebrow={targetNodes.length === 1 ? `Edit · ${BLUEPRINT_LABELS[targetNodes[0].kind].singular}` : `Bulk edit · ${targetNodes.length} selected`}
                    title={targetNodes.length === 1 ? targetNodes[0].title : `Edit ${targetNodes.length} items together`}
                    copy={targetNodes.length === 1 ? 'Choose the change you need.' : 'One operation will apply to every selected item.'}
                  />
                  <div className="rounded-[12px] bg-primary-soft border border-primary/15 px-3.5 py-3 text-[12px] text-content-secondary line-clamp-2">{targetNodes.slice(0, 4).map((node) => node.title).join(' · ')}{targetNodes.length > 4 ? ` · +${targetNodes.length - 4}` : ''}</div>
                  <div className="space-y-2.5">
                    {screen.allowBuildInside && sameKind && next && operation(next === 'steps' ? <ListTree size={18} /> : <ListPlus size={18} />, next === 'steps' ? 'Add steps to selected' : 'Add inside selected', next === 'steps' ? 'Add the same missing steps to every selected leaf task.' : `Add the same structure to all ${targetNodes.length} selected branches.`, () => startItems(screen.selectedIds, next, screen.returnBrowse))}
                    {operation(<FilePenLine size={18} />, targetNodes.length === 1 ? 'Rename or edit details' : 'Rename selected', targetNodes.length === 1 ? 'Change its name, description, or dates.' : 'Give each selected item a clear new name.', () => move(targetNodes.length === 1 ? { type: 'details', nodeId: targetNodes[0].id, returnBrowse: screen.returnBrowse } : { type: 'rename', selectedIds: screen.selectedIds, returnBrowse: screen.returnBrowse }))}
                    {operation(<Trash2 size={18} />, `Remove ${targetNodes.length === 1 ? 'this branch' : 'selected branches'}`, 'Apply this to the draft now; Undo remains available before the final save.', () => {
                      const nextGoals = removeBlueprintNodes(workingGoals, screen.selectedIds);
                      applyToDraft(`Removed ${targetNodes.length} branch${targetNodes.length === 1 ? '' : 'es'}`, nextGoals, browseAt(nextGoals, screen.returnBrowse.pathIds));
                    }, true)}
                  </div>
                  {!sameKind && <p className="text-[11px] text-content-muted text-center">Mixed levels can be renamed or removed together. Select one level at a time to build inside.</p>}
                </div>
              );
            })()}

            {screen.type === 'rename' && (
              <RenameEditor nodes={targetNodes} onContinue={(titles) => applyToDraft(`Renamed ${Object.keys(titles).length} item${Object.keys(titles).length === 1 ? '' : 's'}`, renameBlueprintNodes(workingGoals, titles), screen.returnBrowse)} />
            )}

            {screen.type === 'details' && (() => {
              const node = findGoal(workingGoals, screen.nodeId);
              return node ? <DetailsEditor node={node} onContinue={(patch) => {
                const renamed = renameBlueprintNodes(workingGoals, { [node.id]: patch.title });
                const nextGoals = renamed.map((root) => root.id === node.id ? { ...root, ...patch } : updateDetails(root, node.id, patch));
                applyToDraft(`Updated “${patch.title}”`, nextGoals, screen.returnBrowse);
              }} /> : null;
            })()}

            {screen.type === 'preview' && (
              <div className="space-y-5">
                <StudioTitle eyebrow="Review · Nothing saved yet" title="Ready to save your blueprint?" copy="Check the changes below. You can still go back or undo before saving." />
                <div className="rounded-[14px] border border-subtle bg-elevated px-3.5 py-3 flex items-center gap-3 text-[11.5px]">
                  <span className={`font-bold tabular-nums ${nodeDelta < 0 ? 'text-error' : 'text-primary'}`}>{nodeDelta > 0 ? '+' : ''}{nodeDelta} items</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="text-content-secondary tabular-nums">{nextCount} total</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="text-content-secondary tabular-nums">{maxBlueprintDepth(workingGoals)} levels</span>
                </div>
                <details open className="rounded-[16px] border border-subtle bg-surface overflow-hidden">
                  <summary className="min-h-12 px-4 flex items-center justify-between cursor-pointer text-[12px] font-bold text-content-primary">Applied changes <span className="text-content-muted">{draftChanges.length}</span></summary>
                  <ol className="border-t border-subtle max-h-[30vh] overflow-y-auto no-scrollbar divide-y divide-border-subtle">
                    {draftChanges.map((change, index) => (
                      <li key={change.id} className="min-h-[46px] px-3.5 py-2 flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary-soft text-primary grid place-items-center text-[10px] font-bold shrink-0">{index + 1}</span>
                        <span className="text-[11.5px] font-semibold text-content-primary">{change.summary}</span>
                      </li>
                    ))}
                  </ol>
                </details>
                <details open className="rounded-[16px] border border-subtle bg-surface overflow-hidden">
                  <summary className="min-h-12 px-4 flex items-center justify-between cursor-pointer text-[12px] font-bold text-content-primary">Blueprint structure <span className="text-content-muted">{workingGoals.length} goal{workingGoals.length === 1 ? '' : 's'}</span></summary>
                  <div className="border-t border-subtle px-3.5 py-2 max-h-[38vh] overflow-y-auto no-scrollbar"><TreePreview goals={workingGoals} review={reviewState} /></div>
                </details>
                <div className="grid grid-cols-1 gap-2">
                  <StudioButton onClick={() => {
                    const result = onCommit(baseGoals, workingGoals, screen.summary);
                    if (result.ok) onClose();
                    else if (result.error === 'stale') setError('Your goals changed while Studio was open. Close and reopen Studio so nothing newer is overwritten.');
                    else if (result.error === 'active-session') setError('One removed branch has a focus session running. Stop or save that session before removing the branch.');
                    else setError('There is nothing new to apply.');
                  }} disabled={nodeDelta === 0 && JSON.stringify(baseGoals) === JSON.stringify(workingGoals)}>
                    Save blueprint <Check size={16} />
                  </StudioButton>
                  <StudioButton onClick={goBack} variant="quiet"><ArrowLeft size={14} /> Keep editing</StudioButton>
                </div>
              </div>
            )}

            {error && <div role="alert" className="mt-4 rounded-[12px] border border-error/20 bg-error-soft px-3.5 py-3 text-[12px] leading-relaxed text-error fade-in">{error}</div>}
          </div>
        </main>
        {hasDraftChanges && screen.type !== 'preview' && (
          <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 h-16 rounded-[17px] border border-primary/25 bg-elevated/95 backdrop-blur-xl shadow-elevated px-2.5 flex items-center gap-2 fade-in">
            <button type="button" onClick={() => setDraftHistoryOpen(true)} className="flex-1 min-w-0 h-11 px-2.5 rounded-[12px] text-left hover:bg-surface">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary"><Clock3 size={12} /> Draft</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-content-primary truncate">{draftChanges.length} applied change{draftChanges.length === 1 ? '' : 's'}</span>
            </button>
            <button type="button" onClick={undoDraftChange} className="w-11 h-11 rounded-[12px] grid place-items-center border border-subtle bg-surface text-content-secondary" aria-label="Undo last draft change" title="Undo last change"><RotateCcw size={16} /></button>
            <button type="button" onClick={review} className="h-11 px-4 rounded-[12px] bg-primary text-on-primary text-[12px] font-bold inline-flex items-center gap-1.5">Review <ArrowRight size={14} /></button>
          </div>
        )}
        {draftHistoryOpen && (
          <div className="absolute inset-0 z-30 bg-[var(--backdrop)] backdrop-blur-md flex items-end fade-in" onClick={() => setDraftHistoryOpen(false)}>
            <section className="w-full rounded-t-[22px] border-x border-t border-subtle bg-elevated shadow-elevated p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-border mx-auto" />
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-primary">Draft history</p>
                  <h2 className="mt-1 text-[18px] font-bold text-content-primary">Applied in this order</h2>
                  <p className="mt-1 text-[11.5px] text-content-secondary">Undo removes the newest change first. Nothing is saved yet.</p>
                </div>
                <button type="button" onClick={() => setDraftHistoryOpen(false)} className="w-9 h-9 rounded-full grid place-items-center text-content-muted bg-surface" aria-label="Close history"><X size={16} /></button>
              </div>
              <ol className="mt-4 max-h-[46vh] overflow-y-auto no-scrollbar rounded-[14px] border border-subtle bg-surface divide-y divide-border-subtle">
                {draftChanges.map((change, index) => (
                  <li key={change.id} className="min-h-[52px] px-3.5 py-2.5 flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary-soft text-primary grid place-items-center text-[10px] font-bold shrink-0">{index + 1}</span>
                    <span className="text-[12px] font-semibold leading-snug text-content-primary">{change.summary}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StudioButton onClick={() => { undoDraftChange(); if (draftChanges.length === 1) setDraftHistoryOpen(false); }} variant="secondary"><RotateCcw size={14} /> Undo last</StudioButton>
                <StudioButton onClick={() => { setDraftHistoryOpen(false); review(); }}>Review & save</StudioButton>
              </div>
            </section>
          </div>
        )}
        {discardConfirm && (
          <div className="absolute inset-0 z-20 bg-[var(--backdrop)] backdrop-blur-md grid place-items-center p-5 fade-in">
            <div className="w-full max-w-sm rounded-[18px] border border-subtle bg-elevated p-5 shadow-elevated">
              <div className="w-10 h-10 rounded-[12px] bg-error-soft text-error grid place-items-center"><X size={18} /></div>
              <h2 className="mt-4 text-[18px] font-bold text-content-primary">Leave this draft?</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-content-secondary">These changes exist only in the Studio draft. Leaving now discards all of them.</p>
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
      <StudioButton onClick={() => onContinue(titles)} disabled={!valid}>Apply names <Check size={15} /></StudioButton>
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
      <StudioButton onClick={() => onContinue({ title: title.trim(), description: description.trim() || undefined, startDate: startDate || undefined, endDate: endDate || undefined })} disabled={!title.trim()}>Apply changes <Check size={15} /></StudioButton>
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
