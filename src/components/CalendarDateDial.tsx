import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftLocalISO } from '../lib/dates';
import { useReducedEffects } from '../hooks/useReducedEffects';
import { dialStep } from '../lib/calendarDial';

interface Props { value: string; today: string; onChange: (date: string) => void }

export default function CalendarDateDial({ value, today, onChange }: Props) {
  const [reduced] = useReducedEffects();
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState(0);
  const [direction, setDirection] = useState(1);
  const select = (offset: number) => { setDirection(offset < 0 ? -1 : 1); onChange(shiftLocalISO(value, offset)); };
  const dayLabel = (date: string) => date === today ? 'Today'
    : date === shiftLocalISO(today, -1) ? 'Yesterday'
    : date === shiftLocalISO(today, 1) ? 'Tomorrow'
    : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
  return <section className="calendar-dial" aria-label="Date dial">
    <div className="calendar-dial-caption">
      <span>{new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <button type="button" onClick={() => onChange(today)} disabled={value === today}>Back to today</button>
    </div>
    <div className="calendar-dial-row">
      <button type="button" className="calendar-dial-arrow" aria-label="Previous day" onClick={() => select(-1)}><ChevronLeft size={17} /></button>
      <div className="calendar-dial-window" role="group" aria-label="Swipe or use arrow keys to change date" tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(event.key === 'ArrowLeft' ? -1 : 1); }
          if (event.key === 'Home') { event.preventDefault(); onChange(today); }
        }}
        onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY }; suppressClick.current = false; }}
        onPointerMove={(event) => {
          if (!gesture.current) return;
          const dx = event.clientX - gesture.current.x;
          const dy = event.clientY - gesture.current.y;
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            event.currentTarget.setPointerCapture(event.pointerId);
            suppressClick.current = true;
            setDrag(Math.max(-60, Math.min(60, dx * .5)));
          }
        }}
        onPointerUp={(event) => {
          if (!gesture.current) return;
          const step = dialStep(event.clientX - gesture.current.x, event.clientY - gesture.current.y);
          gesture.current = null; setDrag(0);
          if (step) { suppressClick.current = true; select(step); }
        }}
        onPointerCancel={() => { gesture.current = null; setDrag(0); }}
        onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
        <div className="calendar-dial-marker" aria-hidden="true" />
        <div key={value} className="calendar-dial-track" style={{ transform: `translateX(${reduced ? 0 : drag}px)`, '--dial-direction': direction } as React.CSSProperties}>
          {[-1, 0, 1].map((offset) => {
            const date = shiftLocalISO(value, offset);
            return <button type="button" key={offset} aria-pressed={offset === 0}
              aria-label={new Date(date + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'full' })}
              onClick={() => select(offset)}>
              <span>{dayLabel(date)}</span><strong>{new Date(date + 'T12:00:00').getDate()}</strong>
            </button>;
          })}
        </div>
      </div>
      <button type="button" className="calendar-dial-arrow" aria-label="Next day" onClick={() => select(1)}><ChevronRight size={17} /></button>
    </div>
    <span className="sr-only" aria-live="polite">{new Date(value + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'full' })}</span>
  </section>;
}
