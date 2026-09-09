import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Gauge, Heart, LockKeyhole, MessageCircle, ShieldCheck, TrendingUp, Trophy, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store';
import {
  PACE_BOARD_MIN_OPT_IN,
  PACE_BOARD_TOP_LIMIT,
  paceWindowBarDays,
  paceWindowBarTargetMs,
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
import { todayISO } from '../lib/dates';
import { fetchAppreciations, fetchCommunityContext, giveKudos, type AppreciationState, type CommunityContext } from '../lib/community';
import CommunitySheet from './CommunitySheet';
import { hapticTick } from '../lib/haptics';

const WINDOWS: { id: PaceWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const EMPTY_COMMUNITY_CONTEXT = (): CommunityContext => ({
  available: false,
  dayKey: todayISO(),
  isAdmin: false,
  canJoin: false,
  canPost: false,
  settings: { roomEnabled: false, appreciationsEnabled: false, announcement: '' },
  banned: false,
});

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

function barProgress(row: PaceRow, paceWindow: PaceWindow, anchorISO: string): { percent: number; targetMs: number; overMs: number } {
  const targetMs = Math.max(1, paceWindowBarTargetMs(row.barHours, paceWindow));
  const focused = windowMs(row, paceWindow, anchorISO);
  return {
    percent: Math.min(100, Math.round((focused / targetMs) * 100)),
    targetMs,
    overMs: Math.max(0, focused - targetMs),
  };
}

function windowLabel(paceWindow: PaceWindow): string {
  if (paceWindow === 'week') return 'Focus since Monday · 7-day bar';
  if (paceWindow === 'month') return `Focus since the 1st · ${paceWindowBarDays('month')}-day bar`;
  return 'Today';
}

function rankTone(rank: number | undefined, locked: boolean): string {
  if (locked || rank == null) return 'text-content-muted';
  if (rank === 1) return 'text-primary';
  if (rank === 2) return 'text-content-secondary';
  if (rank === 3) return 'text-primary/80';
  return 'text-content-muted';
}

function BoardRowCard({
  row,
  paceWindow,
  rank,
  mine,
  delta,
  locked = false,
  featured = false,
  anchorISO,
  appreciationCount = 0,
  appreciated = false,
  canAppreciate = false,
  onAppreciate,
}: {
  row: PaceRow;
  paceWindow: PaceWindow;
  rank?: number;
  mine: boolean;
  delta?: RankDelta;
  locked?: boolean;
  featured?: boolean;
  anchorISO: string;
  appreciationCount?: number;
  appreciated?: boolean;
  canAppreciate?: boolean;
  onAppreciate?: () => void;
}) {
  const podium = !locked && rank != null && rank <= 3;
  const progress = barProgress(row, paceWindow, anchorISO);
  const focused = windowMs(row, paceWindow, anchorISO);
  return (
    <li
      value={rank}
      className={`board-person relative overflow-hidden rounded-[15px] border transition-colors ${
        mine
          ? 'border-primary/45 bg-elevated'
          : podium
            ? 'border-primary/25 bg-elevated'
            : 'border-subtle bg-elevated'
      } ${featured ? 'shadow-elevated' : ''}`}
    >
      {(podium || mine) && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
          style={{ background: podium && rank === 1 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 55%, var(--border))' }}
        />
      )}
      <div className="board-person-layout">
        {locked ? (
          <span
            className="grid h-9 w-8 shrink-0 place-items-center text-content-muted"
            aria-label={`Rank locked until ${PACE_BOARD_MIN_OPT_IN} people join`}
            title={`Rank locked until ${PACE_BOARD_MIN_OPT_IN} people join`}
          >
            <LockKeyhole size={12.5} strokeWidth={2.2} />
          </span>
        ) : (
          <span
            className={`flex h-9 w-8 shrink-0 flex-col items-center justify-center text-[14px] font-bold tabular-nums leading-none ${rankTone(rank, locked)}`}
            aria-label={`Rank ${rank}`}
          >
            <span className="mb-1 text-[7px] font-semibold uppercase tracking-[0.14em] opacity-70">Rank</span>
            {String(rank).padStart(2, '0')}
          </span>
        )}
        <div className="board-person-content">
          <div className="board-person-heading">
            <p className="truncate text-[14px] font-semibold text-content-primary">{row.displayName}</p>
            {mine && (
              <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-primary">
                You
              </span>
            )}
            {!locked && delta === 'up' && <ArrowUp size={14} className="shrink-0 text-success" strokeWidth={2.6} />}
            {!locked && delta === 'down' && <ArrowDown size={14} className="shrink-0 text-error" strokeWidth={2.6} />}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-content-muted">{row.examLabel || 'Independent preparation'}</p>
          <p className="board-person-meta">{row.streak}d streak · {formatStreakHours(row.barHours)}/day</p>
        </div>
        <div className="board-person-score">
          <p className="text-[15px] font-bold tabular-nums text-content-primary">{formatDuration(focused)}</p>
          {podium && <button type="button" disabled={!canAppreciate || appreciated} onClick={onAppreciate}
            className={`board-appreciation ${appreciated ? 'is-active' : ''}`}
            aria-pressed={appreciated}
            aria-label={`${appreciated ? 'Kudos given to' : 'Give kudos to'} ${row.displayName}: ${appreciationCount}`}
            title="One acknowledgement per person each UTC day. Never affects rank.">
            <Heart size={12} className={appreciated ? 'fill-current' : ''} />
            <span>Kudos</span>
            {appreciationCount > 0 && <span>{appreciationCount > 99 ? '99+' : appreciationCount}</span>}
          </button>}
        </div>
        <div className="board-person-progress">
            <div className="h-1 overflow-hidden rounded-full bg-track" aria-label={`${progress.percent}% of personal focus bar`}>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${progress.percent >= 100 ? 'bg-secondary' : 'bg-primary'}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className={`board-bar-label ${progress.percent >= 100 ? 'text-secondary' : 'text-primary'}`}>
              {progress.overMs > 0 ? `+${formatDuration(progress.overMs)} over` : progress.percent >= 100 ? 'Bar reached' : `${progress.percent}% of bar`}
            </span>
        </div>
      </div>
    </li>
  );
}

function EmptyRankSlot({ rank }: { rank: number }) {
  return (
    <li className="board-empty-rank flex items-center gap-3 rounded-[15px] border border-dashed border-subtle bg-surface/45 px-3.5">
      <span className="flex w-8 shrink-0 flex-col items-center text-content-muted">
        <span className="text-[7px] font-semibold uppercase tracking-[0.14em]">Rank</span>
        <span className="mt-1 text-[14px] font-bold tabular-nums">{String(rank).padStart(2, '0')}</span>
      </span>
      <span className="h-7 w-px bg-border-subtle" />
      <span>
        <span className="block text-[12.5px] font-semibold text-content-secondary">Waiting for real focus</span>
        <span className="mt-0.5 block text-[10px] text-content-muted">The next focused aspirant earns this place.</span>
      </span>
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
  const [anchorISO, setAnchorISO] = useState(todayISO());
  const [communityOpen, setCommunityOpen] = useState(false);
  const [communityStartInAdmin, setCommunityStartInAdmin] = useState(false);
  const [community, setCommunity] = useState<CommunityContext>(EMPTY_COMMUNITY_CONTEXT);
  const [appreciations, setAppreciations] = useState<AppreciationState>({ counts: {}, mine: new Set() });
  const appreciationBusy = useRef(false);
  const [savingAppreciation, setSavingAppreciation] = useState(false);
  const [appreciationError, setAppreciationError] = useState('');

  useEffect(() => {
    const refreshDate = () => setAnchorISO(todayISO());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      if (user) await publishPublicPace();
      const [res, nextCommunity] = await Promise.all([
        fetchPaceRows(),
        user ? fetchCommunityContext(user.id) : Promise.resolve(EMPTY_COMMUNITY_CONTEXT()),
      ]);
      if (cancelled) return;
      if (!res.ok) {
        setMissingTable(!!res.missingTable);
        setRows([]);
        if (!nextCommunity.error) setCommunity(nextCommunity);
        setLoading(false);
        return;
      }
      setMissingTable(false);
      setCommunity(nextCommunity.error ? EMPTY_COMMUNITY_CONTEXT() : nextCommunity);
      setRows(nextCommunity.banned && user
        ? res.rows.filter((row) => row.userId !== user.id)
        : res.rows);
      setLoading(false);
      if (user && nextCommunity.available) {
        const state = await fetchAppreciations(nextCommunity.dayKey, user.id);
        if (!cancelled) setAppreciations(state);
      } else if (!cancelled) setAppreciations({ counts: {}, mine: new Set() });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, publishPublicPace, pacePrefs.optedIn, pacePrefs.displayName, anchorISO]);

  const closeCommunity = () => {
    setCommunityOpen(false);
    if (!user) return;
    void fetchCommunityContext(user.id).then((next) => {
      if (!next.error) setCommunity(next);
    }).catch(() => { /* Keep the last known Board state during a connection failure. */ });
  };

  const toggleAppreciation = async (targetId: string) => {
    if (!user || appreciationBusy.current || !community.canJoin || !community.settings.appreciationsEnabled || targetId === user.id
      || appreciations.mine.has(targetId) || !podiumIds.includes(targetId)) return;
    appreciationBusy.current = true;
    setSavingAppreciation(true);
    setAppreciationError('');
    const previous = appreciations;
    const active = !appreciations.mine.has(targetId);
    setAppreciations((current) => {
      const mine = new Set(current.mine);
      if (active) mine.add(targetId); else mine.delete(targetId);
      return { mine, counts: { ...current.counts, [targetId]: Math.max(0, (current.counts[targetId] ?? 0) + (active ? 1 : -1)) } };
    });
    try {
      const result = await giveKudos(targetId, paceWindow);
      if (!result.ok) {
        setAppreciationError(result.error ?? 'Could not save your acknowledgement. Please try again.');
        setAppreciations(await fetchAppreciations(community.dayKey, user.id));
      } else hapticTick();
    } catch {
      setAppreciations(previous);
      setAppreciationError('Could not save your acknowledgement. Please try again.');
    } finally {
      appreciationBusy.current = false;
      setSavingAppreciation(false);
    }
  };

  const order = useMemo(() => rankedIds(rows, paceWindow, anchorISO), [rows, paceWindow, anchorISO]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.userId, r])), [rows]);

  useEffect(() => {
    if (rows.length === 0) {
      setDeltas({});
      return;
    }
    const prev = loadSnapshots()[paceWindow] ?? null;
    const nextIds = rankedIds(rows, paceWindow, anchorISO);
    setDeltas(rankDeltas(nextIds, prev));
    saveSnapshot(paceWindow, nextIds);
  }, [rows, paceWindow, anchorISO]);

  const count = rows.length;
  const activeCount = order.length;
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
  const podiumIds = ready ? visibleOrder.slice(0, 3) : [];
  const remainingIds = ready ? visibleOrder.slice(3) : visibleOrder;
  const waitingCount = ready ? count - activeCount : 0;

  return (
    <div className="board-workspace pb-4">
      <header className="board-heading px-0.5">
        <div className="board-heading-topline">
          <h2 className="board-heading-eyebrow">
            <TrendingUp size={17} strokeWidth={2.2} /> Public focus board
          </h2>
          <span><Users size={12.5} />{count} on board</span>
        </div>
        <div className="board-heading-titleline">
          <p className="board-heading-tagline">Earn your place.</p>
          <p>Ranked by focus. Kudos for effort.</p>
        </div>
      </header>

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
      <div className="flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-content-muted">
        <span>{windowLabel(paceWindow)}, local time</span>
        <span className="shrink-0">Ranked by net focus</span>
      </div>

      {community.available && (community.canJoin || community.isAdmin || community.banned) && <div className={`board-community-actions ${community.isAdmin ? 'with-admin' : ''}`}><button type="button" onClick={() => { setCommunityStartInAdmin(false); setCommunityOpen(true); }} className="board-community-link">
        {community.banned ? <ShieldCheck size={17} /> : <MessageCircle size={17} />}
        <span>{community.banned ? 'Community access · Request a review' : 'Community'}</span>
        <span className="board-room-status">{community.banned ? 'Restricted' : community.settings.roomEnabled ? 'Open' : 'Paused'}</span>
        <ChevronDown size={14} className="-rotate-90" />
      </button>{community.isAdmin && <button type="button" onClick={() => { setCommunityStartInAdmin(true); setCommunityOpen(true); }} className="board-admin-link" aria-label="Open community admin"><Gauge size={16} /><span>Admin</span></button>}</div>}

      {appreciationError && <p role="status" className="text-[11px] text-error">{appreciationError}</p>}
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

          {!ready && (
            <ol className="space-y-2" aria-label="Aspirants waiting for the Board">
              {remainingIds.map((id) => {
                const row = byId.get(id);
                if (!row) return null;
                return (
                  <BoardRowCard
                    key={row.userId}
                    row={row}
                    paceWindow={paceWindow}
                    mine={user?.id === row.userId}
                    locked
                    anchorISO={anchorISO}
                    appreciationCount={appreciations.counts[row.userId] ?? 0}
                    appreciated={appreciations.mine.has(row.userId)}
                    canAppreciate={!savingAppreciation && community.canJoin && community.settings.appreciationsEnabled && user?.id !== row.userId}
                    onAppreciate={() => void toggleAppreciation(row.userId)}
                  />
                );
              })}
            </ol>
          )}

          {ready && (
            <>
              <div className="flex items-end justify-between gap-3 px-0.5 pt-1">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-primary/20 bg-primary-soft text-primary">
                    <Trophy size={15} strokeWidth={2.3} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Front runners</p>
                    <h3 className="text-[15px] font-semibold text-content-primary">Top focus {paceWindow === 'today' ? 'today' : `this ${paceWindow}`}</h3>
                  </div>
                </div>
                <span className="mb-0.5 shrink-0 text-[10.5px] font-medium text-content-muted">{activeCount} focused</span>
              </div>

              <ol className="space-y-2" aria-label="Top three focus leaders">
                {[0, 1, 2].map((index) => {
                  const id = podiumIds[index];
                  if (!id) return <EmptyRankSlot key={`empty-rank-${index + 1}`} rank={index + 1} />;
                  const row = byId.get(id);
                  if (!row) return null;
                  return (
                    <BoardRowCard
                      key={row.userId}
                      row={row}
                      paceWindow={paceWindow}
                      rank={rankById.get(id)}
                      mine={user?.id === row.userId}
                      delta={deltas[id]}
                      anchorISO={anchorISO}
                      appreciationCount={appreciations.counts[row.userId] ?? 0}
                      appreciated={appreciations.mine.has(row.userId)}
                      canAppreciate={!savingAppreciation && community.canJoin && community.settings.appreciationsEnabled && user?.id !== row.userId}
                      onAppreciate={() => void toggleAppreciation(row.userId)}
                    />
                  );
                })}
              </ol>

              {remainingIds.length > 0 && (
                <>
                  <div className="flex items-center gap-3 px-0.5 pt-1.5">
                    <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted">The field</p>
                    <div className="h-px flex-1 bg-border-subtle" />
                    <p className="shrink-0 text-[10px] text-content-muted">Top {Math.min(PACE_BOARD_TOP_LIMIT, activeCount)}</p>
                  </div>
                  <ol className="space-y-2" start={4} aria-label={`Remaining Top ${Math.min(PACE_BOARD_TOP_LIMIT, activeCount)} focus leaders`}>
                    {remainingIds.map((id) => {
                      const row = byId.get(id);
                      if (!row) return null;
                      return (
                        <BoardRowCard
                          key={row.userId}
                          row={row}
                          paceWindow={paceWindow}
                          rank={rankById.get(id)}
                          mine={user?.id === row.userId}
                          delta={deltas[id]}
                          anchorISO={anchorISO}
                          appreciationCount={appreciations.counts[row.userId] ?? 0}
                          appreciated={appreciations.mine.has(row.userId)}
                          canAppreciate={!savingAppreciation && community.canJoin && community.settings.appreciationsEnabled && user?.id !== row.userId}
                          onAppreciate={() => void toggleAppreciation(row.userId)}
                        />
                      );
                    })}
                  </ol>
                </>
              )}

              {waitingCount > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-[13px] border border-subtle bg-surface/60 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-semibold text-content-secondary">{waitingCount} waiting to enter the ranking</p>
                    <p className="mt-0.5 text-[10px] text-content-muted">Zero-focus accounts stay unranked until they complete a real session.</p>
                  </div>
                  <span className="shrink-0 text-[18px] font-bold tabular-nums text-content-muted">—</span>
                </div>
              )}
            </>
          )}

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
                    <p className="mt-0.5 text-[11px] text-content-secondary">Your place among {activeCount} focused aspirants</p>
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
                    anchorISO={anchorISO}
                    appreciationCount={appreciations.counts[myRow.userId] ?? 0}
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
                              anchorISO={anchorISO}
                              appreciationCount={appreciations.counts[row.userId] ?? 0}
                              appreciated={appreciations.mine.has(row.userId)}
                              canAppreciate={!savingAppreciation && community.canJoin && community.settings.appreciationsEnabled && user?.id !== row.userId}
                              onAppreciate={() => void toggleAppreciation(row.userId)}
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
      {communityOpen && <CommunitySheet key={communityStartInAdmin ? 'admin' : 'room'} open onClose={closeCommunity} userId={user?.id} rows={rows} initialContext={community} startInAdmin={communityStartInAdmin} />}
    </div>
  );
}
