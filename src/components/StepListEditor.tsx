import { useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export const MAX_STEPS = 8;

interface Props {
  label: string;
  steps: string[];
  onChange: (steps: string[]) => void;
  max?: number;
}

export default function StepListEditor({ label, steps, onChange, max = MAX_STEPS }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (focusIndex.current == null) return;
    const i = focusIndex.current;
    focusIndex.current = null;
    refs.current[i]?.focus();
  }, [steps]);

  const update = (i: number, value: string) => {
    const next = [...steps];
    next[i] = value;
    onChange(next);
  };

  const addAfter = (i: number) => {
    if (steps.length >= max) return;
    const next = [...steps];
    next.splice(i + 1, 0, '');
    focusIndex.current = i + 1;
    onChange(next);
  };

  const addLast = () => {
    if (steps.length >= max) return;
    focusIndex.current = steps.length;
    onChange([...steps, '']);
  };

  const remove = (i: number) => {
    if (steps.length <= 1) return;
    focusIndex.current = Math.max(0, i - 1);
    onChange(steps.filter((_, idx) => idx !== i));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (i < steps.length - 1) {
      refs.current[i + 1]?.focus();
      return;
    }
    addAfter(i);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">{label}</label>
        <span className="text-[10px] text-content-muted">
          {steps.length}/{max}
        </span>
      </div>
      <div className="mt-1.5 space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={s}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              placeholder={`Step ${i + 1}`}
              enterKeyHint="next"
              className="flex-1 min-w-0 bg-surface border border-subtle rounded-xl px-3.5 py-2 text-sm text-content-primary placeholder-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors"
            />
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-2 rounded-lg text-content-muted hover:text-error hover:bg-error-soft transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {steps.length < max && (
        <button
          type="button"
          onClick={addLast}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-primary bg-primary-soft border border-primary-soft hover:border-primary transition-colors"
        >
          <Plus size={13} /> Add step
        </button>
      )}
    </div>
  );
}
