import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Zap } from 'lucide-react';
import {
  type PaceRow,
  type PaceWindow,
  paceWindowBarTargetMs,
  windowMs,
} from '../../lib/paceBoard';
import { formatDuration } from '../../lib/format';
import { ProfileAvatarVisual } from '../../lib/profileAvatar';

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

function barLabel(progress: SquadBarProgress, windowLabel: string): string {
  if (progress.overMs > 0) return `+${formatDuration(progress.overMs)} over bar`;
  if (progress.percentRaw >= 100) return 'Bar reached';
  return `${progress.percentRaw}% of ${windowLabel} bar`;
}

type StackMember = {
  userId: string;
  name: string;
  avatarUrl?: string;
  isSelf: boolean;
  progress: SquadBarProgress;
};

/**
 * One vertical collective column. Each equal slice is that member's own bar.
 * Filling a slice fills the collective at the same time. The column is complete
 * only when every slice has reached its bar.
 */
export function collectiveBarPercent(members: { progress: SquadBarProgress }[]): number {
  if (!members.length) return 0;
  const sum = members.reduce((s, m) => s + m.progress.percentRaw, 0);
  return Math.round(sum / members.length);
}

/** Vertical label + arrow sized to match the hybrid pill height (3.5rem per member). */
function CollectiveBarArrow({
  size,
  className,
  style,
}: {
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const height = Math.round(size * 2.85);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 16 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      <path
        d="M8 44V10M4.25 14.5L8 6.5L11.75 14.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function collectiveBarLabelMetrics(memberCount: number) {
  const rowPx = 56; // min-h-14
  const barHeightPx = memberCount * rowPx;
  const arrowSize = memberCount <= 2 ? 16 : memberCount <= 4 ? 14 : 12;
  const arrowHeightPx = Math.round(arrowSize * 2.85);
  const chromePx = arrowHeightPx + 12; // arrow, gaps, padding
  const textRunPx = Math.max(32, barHeightPx - chromePx);
  const labelFontPx = Math.min(13, Math.max(9, Math.floor(textRunPx / 7.75)));
  const labelWidthPx = labelFontPx + 8;
  return { arrowSize, labelFontPx, labelWidthPx, labelTracking: '0.1em' };
}

function VerticalCollectiveBar({
  members,
  windowShort,
  allComplete,
  collectivePercent,
}: {
  members: StackMember[];
  windowShort: string;
  allComplete: boolean;
  collectivePercent: number;
}) {
  const overCollective = collectivePercent > 100;
  const accent = allComplete || overCollective ? 'text-secondary' : 'text-primary';
  const labelGlowClass = allComplete || overCollective ? 'text-secondary' : 'text-primary-glow';
  const labelTextShadow =
    allComplete || overCollective
      ? '0 0 10px color-mix(in srgb, var(--secondary) 55%, transparent), 0 0 18px color-mix(in srgb, var(--secondary) 25%, transparent)'
      : '0 0 8px color-mix(in srgb, var(--primary-glow) 75%, transparent), 0 0 16px color-mix(in srgb, var(--primary) 40%, transparent)';
  const count = members.length;
  const { arrowSize, labelFontPx, labelWidthPx, labelTracking } = collectiveBarLabelMetrics(count);
  const pillTrackClass =
    'flex w-3 shrink-0 flex-col overflow-hidden rounded-full border border-subtle bg-[color-mix(in_srgb,var(--bg-surface)_92%,transparent)]';

  return (
    <div>
      <div className={`mb-2 flex items-center justify-start ${accent}`}>
        <span className="text-[11px] font-bold tabular-nums">{collectivePercent}%</span>
      </div>
      <div
        className="grid items-stretch gap-x-1.5"
        style={{
          gridTemplateColumns: `${labelWidthPx}px 0.75rem minmax(0, 1fr)`,
          gridTemplateRows: `repeat(${count}, minmax(3.5rem, auto))`,
        }}
        role="img"
        aria-label={
          allComplete
            ? 'Collective bar complete. Every member reached their bar.'
            : 'Vertical collective bar. Each section is one member’s progress.'
        }
      >
        <div
          className={`flex h-full min-h-0 flex-col items-center overflow-hidden py-1 ${accent}`}
          style={{ gridColumn: 1, gridRow: `1 / ${count + 1}`, width: labelWidthPx }}
        >
          <CollectiveBarArrow
            size={arrowSize}
            className={`mb-1 shrink-0 ${labelGlowClass}`}
            style={{
              filter:
                allComplete || overCollective
                  ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--secondary) 55%, transparent))'
                  : 'drop-shadow(0 0 6px color-mix(in srgb, var(--primary-glow) 65%, transparent))',
            }}
          />
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <span
              className={`max-h-full whitespace-nowrap font-extrabold uppercase leading-none [writing-mode:vertical-rl] rotate-180 ${labelGlowClass}`}
              style={{
                textOrientation: 'mixed',
                fontSize: `${labelFontPx}px`,
                letterSpacing: labelTracking,
                textShadow: labelTextShadow,
              }}
            >
              Collective bar
            </span>
          </div>
        </div>

        <div className={pillTrackClass} style={{ gridColumn: 2, gridRow: `1 / ${count + 1}` }}>
          {members.map((m, index) => {
            const over = m.progress.overMs > 0;
            const reached = m.progress.percentRaw >= 100;
            return (
              <div
                key={m.userId}
                className={`relative min-h-0 flex-1 bg-track/80 ${index > 0 ? 'border-t border-subtle' : ''}`}
                title={`${m.name}: ${m.progress.percentRaw}%`}
              >
                <div
                  className={`absolute inset-x-0 bottom-0 transition-[height] duration-500 ${
                    over || reached ? 'bg-secondary' : 'bg-primary'
                  }`}
                  style={{ height: `${m.progress.percent}%` }}
                />
              </div>
            );
          })}
        </div>

        {members.map((m, index) => {
          const over = m.progress.overMs > 0;
          return (
            <div
              key={m.userId}
              className={`flex min-h-14 items-center gap-2.5 py-1.5 ${index > 0 ? 'border-t border-subtle' : ''}`}
              style={{ gridColumn: 3, gridRow: index + 1 }}
            >
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary-soft">
                <ProfileAvatarVisual avatarUrl={m.avatarUrl} displayName={m.name} className="text-xs" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-content-primary">
                  {index + 1}. {m.name}
                  {m.isSelf && <span className="ml-1.5 text-[9px] font-bold uppercase text-primary">You</span>}
                </p>
                <p className={`text-[11px] font-medium ${over ? 'text-secondary' : 'text-content-muted'}`}>
                  {m.progress.percentRaw}% complete
                  {m.progress.focused > 0 ? ` · ${formatDuration(m.progress.focused)}` : ''}
                </p>
                <p className={`text-[10px] ${over ? 'font-semibold text-secondary' : 'text-content-muted'}`}>
                  {barLabel(m.progress, windowShort)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MemberRow = {
  user_id: string;
  profiles?: { display_name?: string; avatar_url?: string } | null;
};

interface Props {
  members: MemberRow[];
  paceByUserId: Record<string, PaceRow>;
  squadBarHours: number;
  paceWindow: PaceWindow;
  anchorISO: string;
  currentUserId?: string;
  emptyPaceRow: (userId: string) => PaceRow;
}

export default function SquadProgressBoard({
  members,
  paceByUserId,
  squadBarHours,
  paceWindow,
  anchorISO,
  currentUserId,
  emptyPaceRow,
}: Props) {
  const windowShort = paceWindow === 'today' ? 'today' : paceWindow === 'week' ? 'this week' : 'this month';

  const memberStats = useMemo(() => {
    return members.map((m) => {
      const row = paceByUserId[m.user_id] ?? emptyPaceRow(m.user_id);
      const progress = computeSquadBarProgress(row, squadBarHours, paceWindow, anchorISO);
      const name = m.profiles?.display_name || 'Member';
      return {
        userId: m.user_id,
        name,
        avatarUrl: m.profiles?.avatar_url,
        row,
        progress,
        updatedAt: row.updatedAt,
        isSelf: m.user_id === currentUserId,
      };
    });
  }, [members, paceByUserId, squadBarHours, paceWindow, anchorISO, currentUserId, emptyPaceRow]);

  const collective = useMemo(() => {
    if (!memberStats.length) return null;
    const totalFocused = memberStats.reduce((s, m) => s + m.progress.focused, 0);
    const totalTarget = memberStats.reduce((s, m) => s + m.progress.targetMs, 0);
    const percentRaw = totalTarget > 0 ? Math.round((totalFocused / totalTarget) * 100) : 0;
    return {
      totalFocused,
      totalTarget,
      percent: Math.min(100, percentRaw),
      percentRaw,
      overMs: Math.max(0, totalFocused - totalTarget),
    };
  }, [memberStats]);

  const activity = useMemo(() => {
    const items = memberStats
      .filter((m) => m.progress.focused > 0)
      .map((m) => ({
        id: m.userId,
        name: m.name,
        progress: m.progress,
        updatedAt: m.updatedAt,
        isSelf: m.isSelf,
      }));

    items.sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (tb !== ta) return tb - ta;
      return b.progress.focused - a.progress.focused;
    });
    return items;
  }, [memberStats]);

  if (!members.length) {
    return (
      <div className="py-10 text-center border border-dashed border-subtle rounded-2xl bg-elevated/30 px-4">
        <p className="text-[13px] font-semibold text-content-primary">No members on the board yet</p>
        <p className="text-[11px] text-content-muted mt-2 leading-relaxed">
          Progress uses synced focus from the Public Board (Today / Week / Month).
        </p>
      </div>
    );
  }

  const reachedCount = memberStats.filter((m) => m.progress.percentRaw >= 100).length;
  const allComplete = memberStats.length > 0 && reachedCount === memberStats.length;
  const collectivePercent = collectiveBarPercent(memberStats);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[18px] border border-primary/30 bg-gradient-to-b from-primary-soft/25 to-elevated p-4 shadow-elevated">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-content-muted capitalize">{paceWindow}</p>
            <p className={`mt-1 text-[15px] font-bold ${allComplete ? 'text-secondary' : 'text-content-primary'}`}>
              {allComplete ? 'Collective complete' : `${reachedCount} of ${memberStats.length} bars reached`}
            </p>
          </div>
          <p className="max-w-[46%] text-right text-[11px] leading-snug text-content-secondary">
            {formatDuration(collective?.totalFocused ?? 0)} together · {squadBarHours}h bar each
          </p>
        </div>
        <VerticalCollectiveBar
          members={memberStats}
          windowShort={windowShort}
          allComplete={allComplete}
          collectivePercent={collectivePercent}
        />
      </section>

      {/* Dynamic activity board */}
      <section>
        <div className="flex items-center gap-2 px-0.5 mb-2.5">
          <Zap size={14} className="text-primary" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-content-muted">Live board</h3>
        </div>
        <div className="rounded-[16px] border border-subtle bg-surface/80 divide-y divide-subtle overflow-hidden">
          {activity.length === 0 ? (
            <p className="text-[12px] text-content-muted text-center py-8 px-4 leading-relaxed">
              No synced focus yet. When members complete sessions on the Public Board, updates appear here.
            </p>
          ) : (
            activity.map((item) => (
              <div key={item.id} className="px-3.5 py-3 flex items-start gap-3">
                <div
                  className={`mt-1.5 size-2 rounded-full shrink-0 ${
                    item.progress.overMs > 0 ? 'bg-secondary' : 'bg-primary'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-content-primary leading-snug">
                    <span className="font-bold">{item.name}</span>
                    {item.isSelf ? ' (you)' : ''}
                    {' · '}
                    <span className="tabular-nums">{formatDuration(item.progress.focused)}</span>
                    {' '}
                    {windowShort}
                    {item.progress.overMs > 0 && (
                      <span className="text-secondary font-semibold">
                        {' '}
                        · +{formatDuration(item.progress.overMs)} over bar
                      </span>
                    )}
                  </p>
                  {item.updatedAt && (
                    <p className="text-[10px] text-content-muted mt-0.5">
                      Last sync {formatRelative(item.updatedAt)}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[11px] font-bold tabular-nums shrink-0 ${
                    item.progress.percentRaw >= 100 ? 'text-secondary' : 'text-content-muted'
                  }`}
                >
                  {item.progress.percentRaw}%
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'recently';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
