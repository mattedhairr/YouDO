import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronRight, Database, Download, Eraser, Flag, Hash, Megaphone, RotateCcw, TrendingDown, type LucideIcon } from 'lucide-react';
import { can } from '../../lib/adminHub';
import { fetchReleaseDownloads, sameDayLastWeek, worthALook, type Change, type LookId, type ReleaseDownloads } from '../../lib/adminGrowth';
import { queueCounts, type OwnerPage, type QueueFilter } from './adminHubShared';
import type { AdminHubData } from './useAdminHubData';

function Tile({ value, label, note, trend, live }: { value: string | number; label: string; note?: string; trend?: Change['trend']; live?: boolean }) {
  return (
    <div className="ah-tile">
      <strong>{live && <i className="ah-live" aria-hidden />}{value}</strong><span>{label}</span>
      {note && <small className={trend ? `ah-trend is-${trend}` : undefined}>{note}</small>}
    </div>
  );
}

function WaitingRow({ icon: Icon, title, text, count, onClick }: { icon: LucideIcon; title: string; text: string; count: number; onClick: () => void }) {
  return (
    <button type="button" className="yd-row" onClick={onClick}>
      <span className="yd-tile" aria-hidden><Icon size={18} strokeWidth={1.9} /></span>
      <span className="yd-row-main"><span className="yd-row-title">{title}</span><span className="yd-row-text truncate">{text}</span></span>
      {count > 0 ? <span className="ah-count">{count}</span> : <ChevronRight size={17} className="text-content-muted" aria-hidden />}
    </button>
  );
}

const LOOK_ICONS: Record<LookId, LucideIcon> = { fewer: TrendingDown, cleanup: Eraser, database: Database, downloads: Download };
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });

/** Today only, and only what needs you; trends stay in Owner → Growth. */
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
  return (
    <div className="ah-page">
      <h3 className="yd-heading mt-2">Today so far</h3>
      {growth ? (
        <div className="ah-tiles">
          <Tile value={counting ? today?.opened ?? 0 : '–'} label="Opened YouDO"
            note={!counting ? 'counting starts with v9' : change?.label} trend={change?.trend} />
          <Tile value={growth.studyingNow} label="Studying now" live={growth.studyingNow > 0} note={`${today?.studied ?? 0} focused today`} />
          <Tile value={today?.newAccounts ?? 0} label="New accounts" note={`${today?.newConfirmed ?? 0} confirmed`} />
          <Tile value={counting ? today?.withoutAccount ?? 0 : '–'} label="Without an account" note="phones today" />
        </div>
      ) : (
        <div className="ah-tiles">
          <Tile value={data.activity?.activeRecently ?? '–'} label="Studying now" live={Boolean(data.activity?.activeRecently)} />
          <Tile value={data.activity?.visitedToday ?? '–'} label="Used the Board today" note={data.activity ? `of ${data.activity.boardMembers} members` : undefined} />
        </div>
      )}
      <section className="yd-section">
        <h3 className="yd-heading">Waiting for you</h3>
        {counts.all === 0
          ? <div className="yd-card"><p className="ah-empty !py-5">Nothing waiting. Nice and quiet.</p></div>
          : (
            <div className="yd-card">
              {counts.reports > 0 && <WaitingRow icon={Flag} title="Reported messages" count={counts.reports}
                text={firstReport ? `“${firstReport.body.slice(0, 50)}”` : 'Needs a decision'} onClick={() => onQueue('reports')} />}
              {counts.hashtags > 0 && <WaitingRow icon={Hash} title="Hashtag requests" count={counts.hashtags}
                text={data.hashtagRequests.slice(0, 3).map((request) => request.examName).join(', ')} onClick={() => onQueue('hashtags')} />}
              {counts.appeals > 0 && <WaitingRow icon={RotateCcw} title="Appeals" count={counts.appeals}
                text={`${data.names.get(data.appeals[0]?.userId) ?? 'A member'} asks to be restored`} onClick={() => onQueue('appeals')} />}
              {counts.backers > 0 && <WaitingRow icon={BadgeCheck} title="Backer claims" count={counts.backers}
                text="Check them against your UPI app" onClick={() => onQueue('backers')} />}
            </div>
          )}
      </section>
      {looks.length > 0 && (
        <section className="yd-section">
          <h3 className="yd-heading">Worth a look</h3>
          <div className="yd-card">
            {looks.map((look) => (
              <WaitingRow key={look.id} icon={LOOK_ICONS[look.id]} title={look.title} text={look.text} count={0}
                onClick={() => onOwner(look.id === 'cleanup' ? 'cleanup' : undefined)} />
            ))}
          </div>
        </section>
      )}
      <section className="yd-section">
        <h3 className="yd-heading">Live</h3>
        <div className="yd-card">
          <WaitingRow icon={Megaphone} title="Board broadcast" count={0} text={announcement ? `“${announcement.slice(0, 60)}”` : 'Nothing live'} onClick={onBroadcast} />
        </div>
      </section>
    </div>
  );
}
