import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, LockKeyhole, TrendingUp, Trophy, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store';
import {
  PACE_BOARD_MIN_OPT_IN,
  PACE_BOARD_TOP_LIMIT,
  rankDeltas,
  rankedIds,
  selectPaceBoardRows,
  windowMs,
  type PaceRow,
  type PaceWindow,
  type RankDelta,
} from '../lib/paceBoard';
import { fetchPaceRows } from '../lib/paceCloud';
import { formatDuration } from '../lib/format';
import { STORAGE_KEYS } from '../lib/storageKeys';
import { formatStreakHours } from '../lib/focusTrends';

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

function BoardRowCard({
  row,
  paceWindow,
  rank,
  mine,
  delta,
  locked = false,
  featured = false,
}: {
  row: PaceRow;
  paceWindow: PaceWindow;
  rank?: number;
  mine: boolean;
  delta?: RankDelta;
  locked?: boolean;
  featured?: boolean;
}) {
  const podium = !locked && rank != null && rank <= 3;
  return (
    <li
      value={rank}
      className={`relative overflow-hidden rounded-[14px] border p-3.5 transition-colors ${
        mine
          ? 'border-primary/45 bg-primary-soft/40'
          : podium
            ? 'border-primary/25 bg-elevated'
            : 'border-subtle bg-elevated'
      } ${featured ? 'shadow-elevated' : ''}`}
    >
      {podium && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-16 opacity-60"
          style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--primary) 11%, transparent), transparent)' }}
        />
      )}
      <div className="relative flex items-start gap-3">
        {locked ? (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full border border-subtle bg-surface text-content-muted"
            aria-label={`Rank locked until ${PACE_BOARD_MIN_OPT_IN} people join`}
            title={`Rank locked until ${PACE_BOARD_MIN_OPT_IN} people join`}
          >
            <LockKeyhole size={12.5} strokeWidth={2.2} />
          </span>
        ) : (
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold tabular-nums ${
              podium
                ? 'border-primary/30 bg-primary-soft text-primary'
                : 'border-subtle bg-surface text-content-muted'
            }`}
            aria-label={`Rank ${rank}`}
          >
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold text-content-primary">{row.displayName}</p>
            {mine && (
              <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-primary">
                You
              </span>
            )}
            {!locked && delta === 'up' && <ArrowUp size={14} className="shrink-0 text-success" strokeWidth={2.6} />}
            {!locked && delta === 'down' && <ArrowDown size={14} className="shrink-0 text-error" strokeWidth={2.6} />}
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
}

export default function BoardView() {
  const { user } = useAuth();
  const { publishPublicPace, pacePrefs } = useStore();
  const [paceWindow, setPaceWindow] = useState<PaceWindow>('today');
  const [rows, setRows] = useState<PaceRow[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deltas, setDeltas] = useState<Record<string, RankDelta>>({});
  const [showNearby, setShowNearby] = useState(false);

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
  const selection = useMemo(() => selectPaceBoardRows(order, user?.id), [order, user?.id]);
  const rankById = useMemo(() => new Map(order.map((id, index) => [id, index + 1])), [order]);
  const myRow = user ? byId.get(user.id) : undefined;
  const showPersonalRank = ready && !!myRow && selection.myRank != null && selection.myRank > PACE_BOARD_TOP_LIMIT;
  const visibleOrder = useMemo(
    () => ready
      ? selection.topIds
      : [...rows]
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .map((row) => row.userId),
    [ready, rows, selection.topIds],
  );

  return (
    <div className="space-y-3.5 pb-4">
      <section className="board-intro relative overflow-hidden rounded-[14px] border border-subtle bg-elevated px-3.5 py-3">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 8% -20%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 52%), radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--secondary) 16%, transparent), transparent 50%)',
          }}
        />
        <div className="relative flex items-center gap-3 min-w-0">
          <div className="board-intro-mark shrink-0 grid size-10 place-items-center rounded-[12px] bg-primary-soft text-primary">
            <TrendingUp size={18} strokeWidth={2.35} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-[15px] font-semibold text-content-primary tracking-tight shrink-0">Net focus, ranked</h2>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary truncate">Public board</span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-4 text-content-secondary line-clamp-2">
              Be honest—padded hours only cheat the person doing the work.
            </p>
          </div>
        </div>
      </section>

      <div className="flex gap-1 rounded-[12px] border border-subtle bg-elevated p-1">
        {WINDOWS.map((tab) => {
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setPaceWindow(tab.id);
                setShowNearby(false);
              }}
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

      {missingTable ? (
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
      ) : (
        <div className="space-y-2.5">
          {!ready && (
            <section className="rounded-[15px] border border-primary/20 bg-primary-soft/25 p-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Board forming</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-content-primary">
                    {count} {count === 1 ? 'aspirant' : 'aspirants'} already joined
                  </p>
                </div>
                <p className="shrink-0 text-[15px] font-semibold tabular-nums text-primary">
                  {count}<span className="text-[11px] font-medium text-content-muted"> / {PACE_BOARD_MIN_OPT_IN}</span>
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (count / PACE_BOARD_MIN_OPT_IN) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-content-secondary">
                Real aspirants are waiting below. Rankings unlock at {PACE_BOARD_MIN_OPT_IN}.
              </p>
              {!pacePrefs.optedIn && (
                <p className="mt-1.5 text-[10.5px] font-medium text-primary">Join from Settings → Public board.</p>
              )}
            </section>
          )}

          {ready && (
            <div className="flex items-end justify-between gap-3 px-0.5 pt-0.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-primary/20 bg-primary-soft text-primary">
                  <Trophy size={15} strokeWidth={2.3} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Leaderboard</p>
                  <h3 className="text-[15px] font-semibold text-content-primary">Top {Math.min(PACE_BOARD_TOP_LIMIT, count)}</h3>
                </div>
              </div>
              <span className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-elevated px-2.5 py-1 text-[10.5px] font-medium text-content-secondary">
                <Users size={12.5} className="text-primary" />
                {count} competing
              </span>
            </div>
          )}

          <ol
            className="space-y-2"
            aria-label={ready ? `Top ${Math.min(PACE_BOARD_TOP_LIMIT, count)}` : 'Aspirants waiting for the Board'}
          >
            {visibleOrder.map((id) => {
              const row = byId.get(id);
              if (!row) return null;
              return (
                <BoardRowCard
                  key={row.userId}
                  row={row}
                  paceWindow={paceWindow}
                  rank={ready ? rankById.get(id) : undefined}
                  mine={user?.id === row.userId}
                  delta={deltas[id]}
                  locked={!ready}
                />
              );
            })}
          </ol>

          {showPersonalRank && myRow && selection.myRank != null && (
            <section className="relative mt-3 overflow-hidden rounded-[18px] border border-primary/35 bg-primary-soft/25 p-3.5 shadow-elevated">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(80% 100% at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%)' }}
              />
              <div className="relative">
                <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Your position</p>
                    <p className="mt-0.5 text-[11px] text-content-secondary">Your place among {count} aspirants</p>
                  </div>
                  <p className="text-[22px] font-bold tabular-nums text-primary">#{selection.myRank}</p>
                </div>

                <ol aria-label="Your Board position">
                  <BoardRowCard
                    row={myRow}
                    paceWindow={paceWindow}
                    rank={selection.myRank}
                    mine
                    delta={deltas[myRow.userId]}
                    featured
                  />
                </ol>

                {selection.nearbyIds.length > 0 && (
                  <div className="mt-2.5 overflow-hidden rounded-[13px] border border-primary/20 bg-elevated/70">
                    <button
                      type="button"
                      onClick={() => setShowNearby((current) => !current)}
                      className="flex h-11 w-full items-center gap-2 px-3 text-left"
                      aria-expanded={showNearby}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-semibold text-content-primary">Around you</span>
                        <span className="block text-[9.5px] text-content-muted">
                          {selection.nearbyIds.length} nearby {selection.nearbyIds.length === 1 ? 'aspirant' : 'aspirants'}
                        </span>
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-primary transition-transform ${showNearby ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {showNearby && (
                      <ol className="space-y-2 border-t border-subtle p-2.5" aria-label="Nearby Board positions">
                        {selection.nearbyIds.map((id) => {
                          const row = byId.get(id);
                          const rank = rankById.get(id);
                          if (!row || rank == null) return null;
                          return (
                            <BoardRowCard
                              key={id}
                              row={row}
                              paceWindow={paceWindow}
                              rank={rank}
                              mine={false}
                              delta={deltas[id]}
                            />
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {ready && selection.myRank == null && !pacePrefs.optedIn && (
            <div className="mt-3 rounded-[15px] border border-dashed border-primary/25 bg-primary-soft/20 px-4 py-3 text-center">
              <p className="text-[12px] font-semibold text-content-primary">Want to see your position?</p>
              <p className="mt-1 text-[10.5px] text-content-secondary">Join from Settings → Public board.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
