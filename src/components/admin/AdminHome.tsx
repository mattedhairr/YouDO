import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronRight, Database, Download, Eraser, Flag, Hash, Megaphone, RotateCcw, TrendingDown, type LucideIcon } from 'lucide-react';
import { can } from '../../lib/adminHub';
import { fetchReleaseDownloads, sameDayLastWeek, worthALook, type LookId, type ReleaseDownloads } from '../../lib/adminGrowth';
import { queueCounts, type OwnerPage, type QueueFilter } from './adminHubShared';
import { AllCaughtUp, LargeTitle, NumberStrip } from './AdminUI';
import type { AdminHubData } from './useAdminHubData';

function Row({ icon: Icon, tone, title, text, count, hot, onClick }: {
  icon: LucideIcon; tone?: 'red' | 'green' | 'amber' | 'grey'; title: string; text?: string; count?: number; hot?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className="yd-row" onClick={onClick}>
      <span className={`yd-tile ${tone ? `is-${tone}` : ''}`} aria-hidden><Icon size={16} strokeWidth={2} /></span>
      <span className="yd-row-main"><span className="yd-row-title">{title}</span>{text && <span className="yd-row-text truncate">{text}</span>}</span>
      {count ? <span className={`ah-count ${hot ? 'is-hot' : ''}`}>{count}</span> : null}
      <ChevronRight size={17} className="ah-chev" aria-hidden />
    </button>
  );
}

const LOOK_ICONS: Record<LookId, LucideIcon> = { fewer: TrendingDown, cleanup: Eraser, database: Database, downloads: Download };
const LOOK_TONES: Record<LookId, 'amber' | 'grey' | 'green' | undefined> = { fewer: 'amber', cleanup: 'grey', database: 'amber', downloads: 'green' };
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** Today: what happened today in one strip, then only what needs you. Trends stay in Owner → Growth. */
export default function AdminHome({ data, onQueue, onBroadcast, onOwner }: {
  data: AdminHubData; onQueue: (filter: QueueFilter) => void; onBroadcast: () => void; onOwner: (page?: OwnerPage) => void;
}) {
  const counts = queueCounts(data);
  const owner = can(data.role, 'growth');
  const growth = owner ? data.growth : null;
  const [latest, setLatest] = useState<ReleaseDownloads | null>(null);
  useEffect(() => {
    if (!owner) return undefined;
    let live = true;
    fetchReleaseDownloads().then((releases) => { if (live) setLatest(releases[0] ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, [owner]);
  const firstReport = data.reportMessages[0];
  const announcement = data.context.settings.announcement.trim();
  const today = growth?.days[growth.days.length - 1];
  const counting = Boolean(growth?.opensSince);
  const change = growth ? sameDayLastWeek(growth, weekday) : null;
  const looks = growth ? worthALook(growth, latest) : [];
  // The small print under the strip: what the four numbers leave out.
  const notes = growth ? [
    !counting ? 'Opens are counted from v9 on' : change?.label,
    `${today?.newConfirmed ?? 0} of the new confirmed`,
    `${today?.studied ?? 0} focused today`,
  ].filter(Boolean) : [];

  return (
    <div className="ah-page">
      <LargeTitle title="Today" subtitle={todayLabel()} />
      {growth ? (
        <>
          <NumberStrip label="Today so far" items={[
            { value: counting ? today?.opened ?? 0 : '–', label: 'Opened' },
            { value: growth.studyingNow, label: 'Studying', live: growth.studyingNow > 0 },
            { value: today?.newAccounts ?? 0, label: 'New' },
            { value: counting ? today?.withoutAccount ?? 0 : '–', label: 'No account' },
          ]} />
          <p className="ah-strip-note">
            {notes.map((note, index) => (
              <span key={note} className={index === 0 && change ? `is-${change.trend}` : undefined}>{index > 0 ? ' · ' : ''}{note}</span>
            ))}
          </p>
        </>
      ) : (
        <>
          <NumberStrip label="Today so far" items={[
            { value: data.activity?.activeRecently ?? '–', label: 'Studying now', live: Boolean(data.activity?.activeRecently) },
            { value: data.activity?.visitedToday ?? '–', label: 'Used the Board' },
          ]} />
          {data.activity && <p className="ah-strip-note">Of {data.activity.boardMembers} on the Board.</p>}
        </>
      )}

      <section className="yd-section mt-5">
        <h3 className="yd-heading">Needs you</h3>
        {counts.all === 0 ? <AllCaughtUp /> : (
          <div className="yd-card">
            {counts.reports > 0 && <Row icon={Flag} tone="red" title="Reported messages" count={counts.reports} hot
              text={firstReport ? `“${firstReport.body.slice(0, 50)}”` : undefined} onClick={() => onQueue('reports')} />}
            {counts.hashtags > 0 && <Row icon={Hash} title="Hashtag requests" count={counts.hashtags}
              text={data.hashtagRequests.slice(0, 3).map((request) => request.examName).join(', ')} onClick={() => onQueue('hashtags')} />}
            {counts.appeals > 0 && <Row icon={RotateCcw} tone="amber" title="Appeals" count={counts.appeals}
              text={`${data.names.get(data.appeals[0]?.userId) ?? 'A member'} asks to be restored`} onClick={() => onQueue('appeals')} />}
            {counts.backers > 0 && <Row icon={BadgeCheck} title="Backer claims" count={counts.backers}
              text="Check them against your UPI app" onClick={() => onQueue('backers')} />}
          </div>
        )}
      </section>

      {looks.length > 0 && (
        <section className="yd-section">
          <h3 className="yd-heading">Worth a look</h3>
          <div className="yd-card">
            {looks.map((look) => (
              <Row key={look.id} icon={LOOK_ICONS[look.id]} tone={LOOK_TONES[look.id]} title={look.title} text={look.text}
                onClick={() => onOwner(look.id === 'cleanup' ? 'cleanup' : look.id === 'database' ? undefined : 'growth')} />
            ))}
          </div>
        </section>
      )}

      <section className="yd-section">
        <h3 className="yd-heading">Live now</h3>
        <div className="yd-card">
          <Row icon={Megaphone} title="Board broadcast" text={announcement ? `“${announcement.slice(0, 60)}”` : 'Nothing live'} onClick={onBroadcast} />
        </div>
      </section>
    </div>
  );
}
