import { useMemo } from 'react';
import type { CSSProperties } from 'react';
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

type StackMember = {
  userId: string;
  name: string;
  avatarUrl?: string;
  isSelf: boolean;
  barHours: number;
  progress: SquadBarProgress;
};

/**
 * One collective percentage. Average of all squad members' progress.
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
  allComplete,
  collectivePercent,
  onOpenProfile,
}: {
  members: StackMember[];
  allComplete: boolean;
  collectivePercent: number;
  onOpenProfile?: (userId: string) => void;
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

  return (
    <div>
      <div className={`mb-2 flex items-center justify-start ${accent}`}>
        <span className="text-[11px] font-bold tabular-nums">{collectivePercent}%</span>
      </div>
      <div
        className="grid items-stretch gap-x-2"
        style={{
          gridTemplateColumns: `${labelWidthPx}px 0.85rem minmax(0, 1fr)`,
          gridTemplateRows: `repeat(${count}, minmax(3.5rem, auto))`,
        }}
        role="img"
        aria-label={
          allComplete
            ? 'Collective bar complete. Every member reached their bar.'
            : 'Vertical collective bar. Each capsule is one member’s progress.'
        }
      >
        {/* Column 1: Vertical label + pointing arrow */}
        <div
          className={`flex h-full min-h-0 flex-col items-center bg-transparent py-1 ${accent}`}
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

        {/* Column 2: Stacked capsules with merging animation */}
        {members.map((m, index) => {
          const isSelfComplete = m.progress.percentRaw >= 100;
          const isAboveComplete = index > 0 && members[index - 1].progress.percentRaw >= 100;
          const isBelowComplete = index < count - 1 && members[index + 1].progress.percentRaw >= 100;
          const mergeTop = isSelfComplete && isAboveComplete && index !== 0;
          const mergeBottom = isSelfComplete && isBelowComplete && index !== count - 1;

          // Capsule border radii: normally rounded-full; flattens where adjacent completed capsules merge
          const topRadius = index === 0 ? 'rounded-t-full' : mergeTop ? 'rounded-t-none' : 'rounded-t-full';
          const bottomRadius = index === count - 1 ? 'rounded-b-full' : mergeBottom ? 'rounded-b-none' : 'rounded-b-full';

          // Capsule vertical margin: normally 3px spacing between capsules; collapses to 0px when merged
          const marginClass = mergeTop && mergeBottom
            ? 'my-0'
            : mergeTop
            ? 'mt-0 mb-0.5'
            : mergeBottom
            ? 'mt-0.5 mb-0'
            : 'my-0.5';

          const fillColor = isSelfComplete ? 'bg-secondary' : 'bg-primary';
          const fillShadow = isSelfComplete
            ? 'shadow-[0_0_8px_color-mix(in_srgb,var(--secondary)_60%,transparent)]'
            : '';

          return (
            <div
              key={`capsule-${m.userId}`}
              style={{ gridColumn: 2, gridRow: index + 1 }}
              className="flex items-stretch justify-center h-full min-h-0 py-0.5"
            >
              <div
                className={`w-3.5 relative flex flex-col justify-end overflow-hidden border border-subtle/80 bg-[color-mix(in_srgb,var(--bg-surface)_90%,transparent)] transition-all duration-300 ${topRadius} ${bottomRadius} ${marginClass}`}
                title={`${m.name}: ${m.progress.percentRaw}%`}
              >
                <div
                  className={`w-full transition-[height] duration-500 ease-out ${fillColor} ${fillShadow}`}
                  style={{ height: `${m.progress.percent}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Column 3: Member rows with interactive DP & clean non-redundant typography */}
        {members.map((m, index) => {
          const over = m.progress.overMs > 0;
          const reached = m.progress.percentRaw >= 100;
          return (
            <div
              key={m.userId}
              className={`flex min-h-14 items-center gap-2.5 py-1.5 ${index > 0 ? 'border-t border-subtle' : ''}`}
              style={{ gridColumn: 3, gridRow: index + 1 }}
            >
              {/* Interactive DP (Display Picture) to open UserProfileSheet */}
              <button
                type="button"
                onClick={() => onOpenProfile?.(m.userId)}
                className="group relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary-soft hover:border-primary hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm"
                title={`View ${m.name}'s profile`}
                aria-label={`View ${m.name}'s profile`}
              >
                <ProfileAvatarVisual avatarUrl={m.avatarUrl} displayName={m.name} className="text-xs" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-semibold text-content-primary">
                    {index + 1}. {m.name}
                  </p>
                  {m.isSelf && (
                    <span className="text-[9px] font-bold uppercase text-primary bg-primary-soft/80 px-1.5 py-0.2 rounded-full border border-primary/20 shrink-0">
                      You
                    </span>
                  )}
                </div>

                {/* Clean non-redundant focus and progress summary */}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {over ? (
                    <>
                      <span className="font-semibold text-secondary">
                        +{formatDuration(m.progress.overMs)} over bar
                      </span>
                      <span className="text-content-muted">·</span>
                      <span className="text-content-muted">{formatDuration(m.progress.focused)} focus</span>
                    </>
                  ) : reached ? (
                    <>
                      <span className="font-semibold text-secondary">Bar reached</span>
                      <span className="text-content-muted">·</span>
                      <span className="text-content-muted">{formatDuration(m.progress.focused)} focus</span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-primary tabular-nums">
                        {m.progress.percentRaw}%
                      </span>
                      <span className="text-content-muted">·</span>
                      <span className="text-content-muted">
                        {m.progress.focused > 0 ? formatDuration(m.progress.focused) : '0m'} focus
                      </span>
                      {m.barHours > 0 && (
                        <span className="text-[10px] text-content-muted/70">
                          ({m.barHours}h bar)
                        </span>
                      )}
                    </>
                  )}
                </div>
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
  viewerBarHours?: number;
  emptyPaceRow: (userId: string) => PaceRow;
  onOpenProfile?: (userId: string) => void;
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
  // All room members participate collectively without segregation
  const memberStats: StackMember[] = useMemo(() => {
    return members.map((m) => {
      const row = paceByUserId[m.user_id] ?? emptyPaceRow(m.user_id);
      const isSelf = m.user_id === currentUserId;
      const personalBar = isSelf && viewerBarHours && viewerBarHours > 0
        ? viewerBarHours
        : Number(row.barHours);
      const progressHours = personalBar > 0 ? personalBar : squadBarHours;
      const progress = computeSquadBarProgress(row, progressHours, paceWindow, anchorISO);
      const name = m.profiles?.display_name || 'Member';
      return {
        userId: m.user_id,
        name,
        avatarUrl: m.profiles?.avatar_url,
        progress,
        barHours: personalBar,
        isSelf,
      };
    });
  }, [members, paceByUserId, squadBarHours, paceWindow, anchorISO, currentUserId, viewerBarHours, emptyPaceRow]);

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
    <div className="flex flex-col gap-4">
      <section className="rounded-[18px] border border-subtle bg-elevated p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-content-muted capitalize">{paceWindow}</p>
            <p className={`mt-1 text-[15px] font-bold ${allComplete ? 'text-secondary' : 'text-content-primary'}`}>
              {allComplete ? 'Collective complete' : `${reachedCount} of ${memberStats.length} bars reached`}
            </p>
          </div>
          <p className="max-w-[46%] text-right text-[11px] leading-snug text-content-secondary">
            {formatDuration(collective?.totalFocused ?? 0)} together
          </p>
        </div>

        <VerticalCollectiveBar
          members={memberStats}
          allComplete={allComplete}
          collectivePercent={collectivePercent}
          onOpenProfile={onOpenProfile}
        />
      </section>
    </div>
  );
}
