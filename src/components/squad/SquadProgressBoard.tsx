import { useMemo } from 'react';
import {
  type PaceRow,
  type PaceWindow,
  paceWindowBarTargetMs,
  windowMs,
} from '../../lib/paceBoard';
import { formatDuration } from '../../lib/format';
import { HubAvatar } from '../hub/HubParts';
import { layoutCapsules } from './capsuleLayout';

export type SquadBarProgress = {
  focused: number;
  percent: number;
  percentRaw: number;
  targetMs: number;
  overMs: number;
};

export function computeSquadBarProgress(
  row: PaceRow,
  squadBarHours: number,
  paceWindow: PaceWindow,
  anchorISO: string,
): SquadBarProgress {
  const anchor = new Date(`${anchorISO}T12:00:00`);
  const targetMs = Math.max(1, paceWindowBarTargetMs(squadBarHours, paceWindow, anchor));
  const focused = windowMs(row, paceWindow, anchorISO);
  const percentRaw = Math.round((focused / targetMs) * 100);
  return {
    focused,
    percent: Math.min(100, percentRaw),
    percentRaw,
    targetMs,
    overMs: Math.max(0, focused - targetMs),
  };
}

/** One collective percentage: the average of every member's progress. */
export function collectiveBarPercent(members: { progress: SquadBarProgress }[]): number {
  if (!members.length) return 0;
  const sum = members.reduce((s, m) => s + m.progress.percentRaw, 0);
  return Math.round(sum / members.length);
}

type BoardMember = {
  userId: string;
  name: string;
  avatarUrl?: string;
  backer?: boolean;
  isSelf: boolean;
  barHours: number;
  /** False when the member has no synced focus to count yet. */
  sharing: boolean;
  progress: SquadBarProgress;
};

type MemberRow = {
  user_id: string;
  profiles?: { display_name?: string; avatar_url?: string; is_backer?: boolean } | null;
};

interface Props {
  members: MemberRow[];
  paceByUserId: Record<string, PaceRow>;
  squadBarHours: number;
  paceWindow: PaceWindow;
  anchorISO: string;
  currentUserId?: string;
  viewerBarHours?: number;
  emptyPaceRow: (userId: string) => PaceRow;
  onOpenProfile?: (userId: string) => void;
}

const WINDOW_EYEBROW: Record<PaceWindow, string> = { today: 'Today', week: 'This week', month: 'This month' };

function CollectiveArrow({ height }: { height: number }) {
  // The shaft stretches with the room size; the head keeps its shape.
  const tail = height - 2;
  return (
    <svg width="14" height={height} viewBox={`0 0 16 ${height}`} fill="none" aria-hidden>
      <path d={`M8 ${tail}V10M4.25 14.5L8 6.5L11.75 14.5`} stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function memberMeta(m: BoardMember) {
  if (!m.sharing) return <span>Not synced yet</span>;
  const { progress } = m;
  if (progress.overMs > 0) {
    return (
      <>
        <span className="is-success">+{formatDuration(progress.overMs)} over</span>
        <span aria-hidden>·</span>
        <span>{formatDuration(progress.focused)}</span>
      </>
    );
  }
  if (progress.percentRaw >= 100) {
    return (
      <>
        <span className="is-success">Bar reached</span>
        <span aria-hidden>·</span>
        <span>{formatDuration(progress.focused)}</span>
      </>
    );
  }
  return (
    <span>
      {progress.focused > 0 ? formatDuration(progress.focused) : '0m'} of {formatDuration(progress.targetMs)}
    </span>
  );
}

export default function SquadProgressBoard({
  members,
  paceByUserId,
  squadBarHours,
  paceWindow,
  anchorISO,
  currentUserId,
  viewerBarHours,
  emptyPaceRow,
  onOpenProfile,
}: Props) {
  const stats: BoardMember[] = useMemo(
    () =>
      members.map((m) => {
        const row = paceByUserId[m.user_id] ?? emptyPaceRow(m.user_id);
        const isSelf = m.user_id === currentUserId;
        const personalBar = isSelf && viewerBarHours && viewerBarHours > 0 ? viewerBarHours : Number(row.barHours);
        const barHours = personalBar > 0 ? personalBar : squadBarHours;
        return {
          userId: m.user_id,
          name: m.profiles?.display_name || 'Member',
          avatarUrl: m.profiles?.avatar_url,
          backer: m.profiles?.is_backer === true,
          isSelf,
          barHours,
          sharing: Boolean(paceByUserId[m.user_id]),
          progress: computeSquadBarProgress(row, barHours, paceWindow, anchorISO),
        };
      }),
    [members, paceByUserId, squadBarHours, paceWindow, anchorISO, currentUserId, viewerBarHours, emptyPaceRow],
  );

  const capsules = useMemo(
    () =>
      layoutCapsules(
        stats.map((s) => ({ id: s.userId, name: s.name, percentRaw: s.progress.percentRaw, overMs: s.progress.overMs, targetMs: s.progress.targetMs })),
      ),
    [stats],
  );

  if (!stats.length) {
    return (
      <div className="hub-group">
        <div className="hub-empty">
          <p className="hub-empty-title">No members yet</p>
          <p className="hub-empty-text">Invite people to see everyone’s progress side by side.</p>
        </div>
      </div>
    );
  }

  const byId = new Map(stats.map((s) => [s.userId, s]));
  const solo = stats.length === 1;
  const reached = stats.filter((s) => s.progress.percentRaw >= 100).length;
  const allComplete = reached === stats.length;
  const together = stats.reduce((sum, s) => sum + s.progress.focused, 0);
  const collective = collectiveBarPercent(stats);
  // The label and arrow span every row. A pair gets slightly taller rows so
  // the arrow and the full label still fit; the type scales with room size.
  const pair = stats.length === 2;
  const rowPx = pair ? 72 : 64;
  const arrowPx = pair ? 26 : 46;
  const labelRun = stats.length * rowPx - arrowPx - 18;
  const labelSize = Math.max(9, Math.min(13, Math.floor(labelRun / 10)));

  return (
    <div className="hub-group" data-testid="squad-board">
      <div className="hub-board-summary">
        <div>
          <p className="hub-board-eyebrow">{WINDOW_EYEBROW[paceWindow]}</p>
          <p className={`hub-board-headline ${allComplete ? 'is-complete' : ''}`}>
            {solo
              ? `${stats[0].progress.percentRaw}% of your bar`
              : allComplete
                ? 'Everyone reached their bar'
                : `${reached} of ${stats.length} reached`}
          </p>
        </div>
        <p className="hub-board-together">
          <strong>{together > 0 ? formatDuration(together) : '0m'}</strong>
          {solo ? 'focused' : 'together'}
        </p>
      </div>

      <div
        className={`hub-board ${solo ? 'is-solo' : ''} ${allComplete ? 'is-all-complete' : ''}`}
        style={{ gridTemplateRows: `repeat(${capsules.length}, var(--row))`, ['--row' as string]: `${rowPx}px` }}
        role="group"
        aria-label={solo ? 'Your progress' : `Collective bar, ${collective}% overall. Lowest progress at the top, highest at the bottom.`}
      >
        {!solo && (
          <div
            className={`hub-board-label ${allComplete ? 'is-complete' : ''}`}
            style={{
              gridColumn: 1,
              gridRow: `1 / ${capsules.length + 1}`,
              ['--label-size' as string]: `${labelSize}px`,
              ['--label-tracking' as string]: pair ? '0.06em' : '0.12em',
            }}
            aria-hidden
          >
            <CollectiveArrow height={arrowPx} />
            <span>Collective bar</span>
          </div>
        )}

        {capsules.map((c, index) => (
          <div
            key={`capsule-${c.id}`}
            className={`hub-capsule-slot ${c.weldTop ? 'weld-top' : ''} ${c.weldBottom ? 'weld-bottom' : ''}`}
            style={{ gridColumn: solo ? 1 : 2, gridRow: index + 1 }}
            data-capsule={c.id}
            data-weld={c.weldTop && c.weldBottom ? 'both' : c.weldTop ? 'top' : c.weldBottom ? 'bottom' : 'none'}
            data-complete={c.complete ? 'true' : 'false'}
          >
            <div className={`hub-capsule ${c.complete ? 'is-complete' : ''}`} title={`${c.name}: ${c.percentRaw}%`}>
              <div className="hub-capsule-fill" style={{ height: `${c.fillPercent}%` }} />
              {c.extraPercent > 0 && <div className="hub-capsule-extra" style={{ height: `${c.extraPercent}%` }} />}
            </div>
          </div>
        ))}

        {capsules.map((c, index) => {
          const m = byId.get(c.id)!;
          const complete = m.progress.percentRaw >= 100;
          return (
            <div key={m.userId} className="hub-member" style={{ gridColumn: solo ? 2 : 3, gridRow: index + 1 }}>
              <button
                type="button"
                className="shrink-0 rounded-full"
                onClick={() => onOpenProfile?.(m.userId)}
                aria-label={`View ${m.name}'s profile`}
                title={`View ${m.name}'s profile`}
              >
                <HubAvatar url={m.avatarUrl} name={m.name} size="sm" backer={m.backer} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="hub-member-name">
                  <span className="hub-truncate">{m.name}</span>
                  {m.isSelf && <span className="hub-chip is-tint">You</span>}
                </p>
                <p className="hub-member-meta">{memberMeta(m)}</p>
              </div>
              <span className={`hub-member-percent ${complete ? 'is-complete' : ''}`}>
                {m.sharing ? `${m.progress.percentRaw}%` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
