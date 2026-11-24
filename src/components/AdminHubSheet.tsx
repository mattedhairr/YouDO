import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronRight, Crown, Flag, Hash, Home, Inbox, Loader2, Megaphone, RefreshCw, RotateCcw, Sparkles, Users, type LucideIcon } from 'lucide-react';
import Overlay from './Overlay';
import { HubNavBar } from './hub/HubParts';
import AdminBackersReviewModal from './AdminBackersReviewModal';
import { setBackStep } from '../lib/backSteps';
import { can, returnRate } from '../lib/adminHub';
import { ADMIN_QUEUE_EVENT } from '../hooks/useAdminHubCounts';
import { useAdminHubData, type AdminHubData } from './admin/useAdminHubData';
import AdminQueue from './admin/AdminQueue';
import { PeopleList, PersonPage } from './admin/AdminPeople';
import AdminCommunity from './admin/AdminCommunity';
import AdminOwner from './admin/AdminOwner';
import { COMMUNITY_PAGE_TITLES, OWNER_PAGE_TITLES, queueCounts, type CommunityPage, type OwnerPage, type QueueFilter } from './admin/adminHubShared';
import '../signature.css';
import './community/community.css';
import './admin/adminHub.css';

type Tab = 'home' | 'queue' | 'people' | 'community' | 'owner';
type Page = { kind: 'person'; id: string } | { kind: 'community'; page: CommunityPage } | { kind: 'owner'; page: OwnerPage };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'queue', label: 'Queue', icon: Inbox },
  { id: 'people', label: 'People', icon: Users },
  { id: 'community', label: 'Community', icon: Sparkles },
  { id: 'owner', label: 'Owner', icon: Crown },
];
const TAB_TITLES: Record<Tab, string> = { home: 'Admin Hub', queue: 'Queue', people: 'People', community: 'Community', owner: 'Owner' };

function Tile({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return <div className="ah-tile"><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</div>;
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

function AdminHome({ data, onQueue, onBroadcast }: { data: AdminHubData; onQueue: (filter: QueueFilter) => void; onBroadcast: () => void }) {
  const counts = queueCounts(data);
  const owner = can(data.role, 'growth');
  const growth = data.growth;
  const firstReport = data.reportMessages[0];
  const back = growth ? returnRate(growth.sinceV8) : null;
  const announcement = data.context.settings.announcement.trim();
  return (
    <div className="ah-page">
      <h3 className="yd-heading mt-2">Today</h3>
      <div className="ah-tiles">
        <Tile value={owner && growth ? growth.studyingNow : data.activity?.activeRecently ?? '–'} label={owner ? 'Studying now' : 'Active now'} />
        <Tile value={data.activity?.visitedToday ?? '–'} label="Used the Board today" note={data.activity ? `of ${data.activity.boardMembers} members` : undefined} />
        {owner && growth && <Tile value={growth.new7d} label="New this week" note={`${growth.new7dConfirmed} confirmed`} />}
        {owner && growth && <Tile value={back === null ? '–' : `${back}%`} label="Came back" note="after day one, since v8" />}
      </div>
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
      <h3 className="yd-heading mt-5">Live</h3>
      <div className="yd-card">
        <WaitingRow icon={Megaphone} title="Board broadcast" count={0} text={announcement ? `“${announcement.slice(0, 60)}”` : 'Nothing live'} onClick={onBroadcast} />
      </div>
    </div>
  );
}

/**
 * The Admin Hub, opened by holding the Settings button or from Settings → Admin Hub.
 * Five tabs; the Owner tab and the owner-only parts show only for the owner,
 * and the server refuses them to anyone else (supabase/admin_hub.sql).
 */
export default function AdminHubSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, error, refreshing, refresh } = useAdminHubData(userId);
  const [tab, setTab] = useState<Tab>('home');
  const [page, setPage] = useState<Page | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [backersOpen, setBackersOpen] = useState(false);
  const [peopleKey, setPeopleKey] = useState(0);
  const body = useRef<HTMLElement>(null);

  // Android's Back reaches the Admin Hub through App: it leaves a page first, then the hub.
  useEffect(() => {
    setBackStep('admin', page ? () => setPage(null) : null);
    return () => setBackStep('admin', null);
  }, [page]);
  useEffect(() => { body.current?.scrollTo?.(0, 0); }, [tab, page]);
  // The Settings button's count follows what was handled here.
  useEffect(() => () => { window.dispatchEvent(new Event(ADMIN_QUEUE_EVENT)); }, []);

  const goBack = () => (page ? setPage(null) : onClose());
  const reload = async () => { await refresh(); window.dispatchEvent(new Event(ADMIN_QUEUE_EVENT)); };

  if (!data) {
    return (
      <Overlay open onClose={onClose} align="full" screen>
        <div role="status" className="app-frame mx-auto flex h-full w-full max-w-md items-center justify-center gap-2 bg-base text-[12px] text-content-muted">
          {error ? <span className="px-6 text-center">{error}</span> : <><Loader2 size={16} className="animate-spin text-primary" /> Opening Admin Hub…</>}
        </div>
      </Overlay>
    );
  }

  const role = data.role;
  const tabs = TABS.filter((item) => item.id !== 'owner' || can(role, 'growth'));
  const counts = queueCounts(data);
  const title = page?.kind === 'person' ? 'Person'
    : page?.kind === 'community' ? COMMUNITY_PAGE_TITLES[page.page]
    : page?.kind === 'owner' ? OWNER_PAGE_TITLES[page.page]
    : TAB_TITLES[tab];
  const openPerson = (id: string) => setPage({ kind: 'person', id });

  return (
    <Overlay open onClose={goBack} align="full" screen>
      <div className="community-shell hub app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base">
        <HubNavBar
          title={title}
          subtitle={refreshing ? 'Refreshing…' : undefined}
          onBack={goBack}
          backLabel={page ? 'Back' : 'Close Admin Hub'}
          actions={<>
            {role && !page && <span className="ah-role">{role === 'owner' ? 'Owner' : 'Admin'}</span>}
            <button type="button" className="hub-icon-button" disabled={refreshing} onClick={() => void reload()} aria-label="Refresh">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </>}
        />
        {error && <p role="status" className="mx-4 mt-2 text-[12px] text-error">{error}</p>}
        {!data.context.isAdmin || !role ? (
          <p className="ah-empty">Admin access is not available for this account.</p>
        ) : (
          <>
            <main ref={body} className="ah-body">
              {page?.kind === 'person' && (
                <PersonPage key={page.id} id={page.id} role={role} selfId={userId}
                  onChanged={() => { setPeopleKey((key) => key + 1); void reload(); }}
                  onDeleted={() => { setPage(null); setPeopleKey((key) => key + 1); void reload(); }} />
              )}
              {page?.kind === 'community' && <AdminCommunity data={data} selfId={userId} page={page.page} onPage={(next) => setPage({ kind: 'community', page: next })} onRefresh={reload} onOpenPerson={openPerson} />}
              {page?.kind === 'owner' && <AdminOwner data={data} page={page.page} onPage={(next) => setPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onOpenBackers={() => setBackersOpen(true)} onRefresh={reload} />}
              {!page && tab === 'home' && (
                <AdminHome data={data} onQueue={(filter) => { setQueueFilter(filter); setTab('queue'); }}
                  onBroadcast={() => (can(role, 'broadcast') ? setPage({ kind: 'community', page: 'broadcast' }) : setTab('community'))} />
              )}
              {!page && tab === 'queue' && <AdminQueue data={data} filter={queueFilter} onFilter={setQueueFilter} onRefresh={reload} onOpenBackers={() => setBackersOpen(true)} onOpenPerson={openPerson} />}
              {!page && tab === 'people' && <PeopleList key={peopleKey} role={role} onOpen={openPerson} />}
              {!page && tab === 'community' && <AdminCommunity data={data} selfId={userId} page={null} onPage={(next) => setPage({ kind: 'community', page: next })} onRefresh={reload} />}
              {!page && tab === 'owner' && <AdminOwner data={data} page={null} onPage={(next) => setPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onOpenBackers={() => setBackersOpen(true)} onRefresh={reload} />}
            </main>
            <nav className="ah-tabs" role="tablist" aria-label="Admin Hub">
              {tabs.map(({ id, label, icon: Icon }) => {
                const count = id === 'queue' ? counts.all : 0;
                return (
                  <button key={id} type="button" role="tab" className="ah-tab" aria-selected={!page && tab === id}
                    aria-label={count ? `${label}, ${count} waiting` : label}
                    onClick={() => { setPage(null); setTab(id); if (id === 'queue') setQueueFilter('all'); }}>
                    <Icon size={20} strokeWidth={tab === id ? 2.3 : 1.8} aria-hidden />
                    {label}
                    {count > 0 && <span className="ah-tab-count" aria-hidden>{count > 99 ? '99+' : count}</span>}
                  </button>
                );
              })}
            </nav>
          </>
        )}
        {can(role, 'money') && <AdminBackersReviewModal open={backersOpen} onClose={() => { setBackersOpen(false); void reload(); }} />}
      </div>
    </Overlay>
  );
}
