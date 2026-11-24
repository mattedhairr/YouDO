import { useEffect, useState } from 'react';
import { CheckCircle2, Moon, Timer } from 'lucide-react';
import { focusElapsedMs, isLiveFocus, type FocusStatus } from '../../lib/focusStatus';
import { type PaceRow, paceWindowBarTargetMs, windowMs } from '../../lib/paceBoard';
import { formatDuration } from '../../lib/format';
import { HubAvatar, HubSection } from '../hub/HubParts';
import { formatClock, formatHubTime } from '../hub/hubTime';

export interface ActivityMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  backer?: boolean;
  isSelf: boolean;
  barHours: number;
}

interface Props {
  members: ActivityMember[];
  statuses: Record<string, FocusStatus>;
  paceByUserId: Record<string, PaceRow>;
  anchorISO: string;
  onOpenProfile?: (userId: string) => void;
}

/**
 * Live: who is focusing right now (from focus_status, shared on start / pause /
 * stop, so it holds with the screen off). Today: each member's synced focus.
 */
export default function RoomActivity({ members, statuses, paceByUserId, anchorISO, onOpenProfile }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const live = members
    .map((m) => ({ member: m, status: statuses[m.userId] }))
    .filter((x): x is { member: ActivityMember; status: FocusStatus } => Boolean(x.status) && isLiveFocus(x.status, now))
    .sort((a, b) => (a.status.state === b.status.state ? 0 : a.status.state === 'focusing' ? -1 : 1));
  const anyFocusing = live.some((x) => x.status.state === 'focusing');

  useEffect(() => {
    if (!anyFocusing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [anyFocusing]);

  const anchor = new Date(`${anchorISO}T12:00:00`);
  const today = members
    .map((m) => {
      const row = paceByUserId[m.userId];
      if (!row) return null;
      const focused = windowMs(row, 'today', anchorISO);
      if (focused <= 0) return null;
      const reached = focused >= paceWindowBarTargetMs(m.barHours, 'today', anchor);
      return { member: m, focused, reached, at: row.updatedAt };
    })
    .filter((x): x is { member: ActivityMember; focused: number; reached: boolean; at: string } => x !== null)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <HubSection
        title="Live"
        aside={live.length > 0 ? `${live.length} active` : undefined}
        footer="Shows when room-mates focus, never what they work on."
      >
        <div className="hub-group">
          {live.length === 0 ? (
            <div className="hub-row is-compact">
              <span className="hub-activity-icon" aria-hidden><Moon size={15} /></span>
              <span className="hub-row-main">
                <span className="hub-row-subtitle block">No one is focusing right now.</span>
              </span>
            </div>
          ) : (
            live.map(({ member, status }) => {
              const focusing = status.state === 'focusing';
              const elapsed = focusElapsedMs(status, now);
              return (
                <button
                  key={member.userId}
                  type="button"
                  className="hub-row"
                  onClick={() => onOpenProfile?.(member.userId)}
                  aria-label={`${member.isSelf ? 'You' : member.name}, ${focusing ? 'focusing' : 'paused'}, ${formatDuration(elapsed)}`}
                >
                  <HubAvatar url={member.avatarUrl} name={member.name} dot={focusing ? 'live' : undefined} backer={member.backer} />
                  <span className="hub-row-main">
                    <span className="hub-row-title">
                      <span className="hub-truncate">{member.isSelf ? 'You' : member.name}</span>
                    </span>
                    <span className="hub-row-subtitle flex items-center gap-1.5">
                      {focusing ? (
                        <><span className="hub-live-dot" aria-hidden /> Focusing</>
                      ) : (
                        'Paused'
                      )}
                    </span>
                  </span>
                  <span className={`text-[17px] font-semibold tabular-nums ${focusing ? 'hub-live-timer' : 'text-content-muted'}`}>
                    {formatClock(elapsed)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </HubSection>

      <HubSection title="Today" footer="Updates after each member’s focus syncs.">
        <div className="hub-group">
          {today.length === 0 ? (
            <div className="hub-row is-compact">
              <span className="hub-activity-icon" aria-hidden><Timer size={15} /></span>
              <span className="hub-row-main">
                <span className="hub-row-subtitle block">No focus synced yet today.</span>
              </span>
            </div>
          ) : (
            today.map(({ member, focused, reached, at }) => (
              <div key={member.userId} className="hub-row is-compact">
                <span className={`hub-activity-icon ${reached ? 'is-success' : 'is-tint'}`} aria-hidden>
                  {reached ? <CheckCircle2 size={15} /> : <Timer size={15} />}
                </span>
                <span className="hub-row-main">
                  <span className="hub-row-title text-[15px]">
                    <span className="hub-truncate">
                      {member.isSelf ? 'You' : member.name}
                      <span className="font-normal text-content-secondary">
                        {reached ? ' reached the bar' : ` · ${formatDuration(focused)} focused`}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="hub-row-time">{formatHubTime(at)}</span>
              </div>
            ))
          )}
        </div>
      </HubSection>
    </>
  );
}
