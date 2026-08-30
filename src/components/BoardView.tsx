import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LogIn, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store';
import {
  PACE_BOARD_MIN_OPT_IN,
  PACE_HONEST_QUOTE,
  rankDeltas,
  rankedIds,
  windowMs,
  type PaceRow,
  type PaceWindow,
  type RankDelta,
} from '../lib/paceBoard';
import { fetchPaceRows } from '../lib/paceCloud';
import { formatDuration } from '../lib/format';
import { STORAGE_KEYS } from '../lib/storageKeys';
import { formatStreakHours } from '../lib/focusTrends';

interface Props {
  onSignIn: () => void;
}

const WINDOWS: { id: PaceWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function loadSnapshots(): Partial<Record<PaceWindow, string[]>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.paceRankSnapshot);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<Record<PaceWindow, string[]>>;
  } catch {
    return {};
  }
}

function saveSnapshot(window: PaceWindow, ids: string[]) {
  try {
    const next = { ...loadSnapshots(), [window]: ids };
    localStorage.setItem(STORAGE_KEYS.paceRankSnapshot, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function BoardView({ onSignIn }: Props) {
  const { user } = useAuth();
  const { publishPublicPace, pacePrefs } = useStore();
  const [paceWindow, setPaceWindow] = useState<PaceWindow>('today');
  const [rows, setRows] = useState<PaceRow[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deltas, setDeltas] = useState<Record<string, RankDelta>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      if (user) await publishPublicPace();
      const res = await fetchPaceRows();
      if (cancelled) return;
      if (!res.ok) {
        setMissingTable(!!res.missingTable);
        setRows([]);
        setLoading(false);
        return;
      }
      setMissingTable(false);
      setRows(res.rows);
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, publishPublicPace, pacePrefs.optedIn, pacePrefs.displayName]);

  const order = useMemo(() => rankedIds(rows, paceWindow), [rows, paceWindow]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.userId, r])), [rows]);

  useEffect(() => {
    if (rows.length === 0) {
      setDeltas({});
      return;
    }
    const prev = loadSnapshots()[paceWindow] ?? null;
    const nextIds = rankedIds(rows, paceWindow);
    setDeltas(rankDeltas(nextIds, prev));
    saveSnapshot(paceWindow, nextIds);
  }, [rows, paceWindow]);

  const count = rows.length;
  const ready = count >= PACE_BOARD_MIN_OPT_IN;

  return (
    <div className="space-y-4 pb-4">
      <div className="relative overflow-hidden rounded-[16px] border border-subtle bg-elevated p-4">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 8% -20%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 52%), radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--secondary) 16%, transparent), transparent 50%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp size={16} strokeWidth={2.4} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Public board</p>
          </div>
          <h2 className="mt-1.5 text-[18px] font-semibold text-content-primary tracking-tight">Net focus, ranked</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-content-secondary">{PACE_HONEST_QUOTE}</p>
          <p className="mt-2 text-[11px] text-content-muted">
            Honor system. Numbers are what each person published after a sitting — not verified.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-[12px] border border-subtle bg-elevated p-1">
        {WINDOWS.map((tab) => {
          const active = paceWindow === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPaceWindow(tab.id)}
              className={`flex-1 h-9 rounded-[10px] text-[12px] font-semibold transition-colors ${
                paceWindow === tab.id ? 'bg-primary-soft text-primary' : 'text-content-muted'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-content-muted px-0.5">
        {paceWindow === 'week'
          ? 'Week is Monday through today, local time.'
          : paceWindow === 'month'
            ? 'Month is the 1st through today, local time.'
            : 'Today is this local calendar day.'}
      </p>

      {!user ? (
        <div className="rounded-[16px] border border-subtle bg-surface p-5 text-center">
          <p className="text-[14px] font-semibold text-content-primary">Sign in to see the board</p>
          <p className="mt-1 text-[12px] text-content-secondary">
            Rankings are only visible when you are signed in. Opt in from Settings when you are ready.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-[13px] font-semibold text-on-primary"
          >
            <LogIn size={15} />
            Sign in
          </button>
        </div>
      ) : missingTable ? (
        <div className="rounded-[16px] border border-subtle bg-surface p-5">
          <p className="text-[14px] font-semibold text-content-primary">Board is not set up yet</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-content-secondary">
            The public table has not been created on this project. Run <span className="font-mono text-[11px]">supabase/public_pace.sql</span> in the Supabase SQL editor, then reopen Board.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-[16px] border border-subtle bg-surface p-8 text-center text-[13px] text-content-muted">
          Loading…
        </div>
      ) : !ready ? (
        <div className="rounded-[16px] border border-subtle bg-surface p-5 text-center">
          <p className="text-[22px] font-semibold tabular-nums text-primary">
            {count}
            <span className="text-content-muted text-[14px] font-medium"> / {PACE_BOARD_MIN_OPT_IN}</span>
          </p>
          <p className="mt-2 text-[14px] font-semibold text-content-primary">Waiting for a full board</p>
          <p className="mt-1 text-[12px] leading-relaxed text-content-secondary">
            Rankings stay hidden until {PACE_BOARD_MIN_OPT_IN} people opt in. You can still join from Settings — that is how the count grows.
          </p>
          {!pacePrefs.optedIn && (
            <p className="mt-3 text-[11px] text-content-muted">Opt in is off by default. Open Settings → Public board.</p>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {order.map((id, index) => {
            const row = byId.get(id);
            if (!row) return null;
            const mine = user.id === row.userId;
            const delta = deltas[id];
            return (
              <li
                key={row.userId}
                className={`rounded-[14px] border p-3.5 ${
                  mine ? 'border-primary/45 bg-primary-soft/40' : 'border-subtle bg-elevated'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="w-7 shrink-0 text-[15px] font-semibold tabular-nums text-content-muted">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[14px] font-semibold text-content-primary">{row.displayName}</p>
                      {delta === 'up' && <ArrowUp size={14} className="shrink-0 text-success" strokeWidth={2.6} />}
                      {delta === 'down' && <ArrowDown size={14} className="shrink-0 text-error" strokeWidth={2.6} />}
                    </div>
                    {row.examLabel ? (
                      <p className="mt-0.5 truncate text-[11px] text-content-muted">{row.examLabel}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-content-secondary">
                      {row.streak}d streak · {formatStreakHours(row.barHours)} bar
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-semibold tabular-nums text-content-primary">
                    {formatDuration(windowMs(row, paceWindow))}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
