import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * The Admin Hub's building blocks (v9.1, the Apple-style redesign): a large
 * title per screen, a strip of numbers, a segmented switch and a calm "all
 * caught up". Lists and rows are the signature style's yd-card / yd-row,
 * restyled inside the hub by `.ah-apple` (adminHub.css).
 */

export function LargeTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ah-large">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children}
    </header>
  );
}

/** A few numbers side by side, each with a short label; `live` shows the number in green (something happening now). */
export function NumberStrip({ items, label }: { items: { value: ReactNode; label: string; live?: boolean }[]; label?: string }) {
  return (
    <div className="ah-strip" role="group" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <b className={item.live ? 'is-live' : undefined}>{item.value}</b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** One choice of a few, like iOS's segmented control. */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="ah-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>
      ))}
    </div>
  );
}

/** Nothing waits: said once, calmly. */
export function AllCaughtUp({ text = 'Nothing needs you right now.' }: { text?: string }) {
  return (
    <div className="yd-card ah-done">
      <CheckCircle2 size={26} strokeWidth={1.8} aria-hidden />
      <b>All caught up</b>
      <span>{text}</span>
    </div>
  );
}
