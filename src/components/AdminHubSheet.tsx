import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Home, Inbox, Loader2, RefreshCw, Sparkles, Users, type LucideIcon } from 'lucide-react';
import Overlay from './Overlay';
import { HubNavBar } from './hub/HubParts';
import AdminBackersReviewModal from './AdminBackersReviewModal';
import { setBackStep } from '../lib/backSteps';
import { can } from '../lib/adminHub';
import { ADMIN_QUEUE_EVENT } from '../hooks/useAdminHubCounts';
import { useAdminHubData } from './admin/useAdminHubData';
import AdminQueue from './admin/AdminQueue';
import { PeopleList, PersonPage } from './admin/AdminPeople';
import AdminCommunity from './admin/AdminCommunity';
import AdminOwner from './admin/AdminOwner';
import AdminHome from './admin/AdminHome';
import AdminEmail, { type EmailStart } from './admin/AdminEmail';
import AdminBackers from './admin/AdminBackers';
import { COMMUNITY_PAGE_TITLES, OWNER_PAGE_TITLES, queueCounts, type CommunityPage, type OwnerPage, type QueueFilter } from './admin/adminHubShared';
import { LargeTitle } from './admin/AdminUI';
import { HubBackContext, type HubBack } from './admin/hubBack';
import '../signature.css';
import './community/community.css';
import './admin/adminHub.css';

type Tab = 'home' | 'queue' | 'people' | 'community' | 'owner';
type Page = { kind: 'person'; id: string } | { kind: 'community'; page: CommunityPage } | { kind: 'owner'; page: OwnerPage }
  | { kind: 'email'; start?: EmailStart; key: number };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Today', icon: Home },
  { id: 'queue', label: 'Inbox', icon: Inbox },
  { id: 'people', label: 'People', icon: Users },
  { id: 'community', label: 'Community', icon: Sparkles },
  { id: 'owner', label: 'Owner', icon: Crown },
];
const TAB_TITLES: Record<Tab, string> = { home: 'Today', queue: 'Inbox', people: 'People', community: 'Community', owner: 'Owner' };

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
  // Screens inside a page (a send, Templates) take over the one back button (useHubBack); the latest wins.
  const [inners, setInners] = useState<{ id: number; entry: HubBack }[]>([]);
  const innerSeq = useRef(0);
  const registerBack = useCallback((entry: HubBack) => {
    innerSeq.current += 1;
    const id = innerSeq.current;
    setInners((list) => [...list, { id, entry }]);
    return () => setInners((list) => list.filter((item) => item.id !== id));
  }, []);
  const inner = inners.length ? inners[inners.length - 1].entry : null;

  // Android's Back reaches the Admin Hub through App: it steps back as the button does, then leaves the hub.
  useEffect(() => {
    setBackStep('admin', inner ? inner.back : page ? () => setPage(null) : null);
    return () => setBackStep('admin', null);
  }, [page, inner]);
  useEffect(() => { body.current?.scrollTo?.(0, 0); }, [tab, page, inners.length]);
  // The Settings button's count follows what was handled here.
  useEffect(() => () => { window.dispatchEvent(new Event(ADMIN_QUEUE_EVENT)); }, []);

  const goBack = () => (inner ? inner.back() : page ? setPage(null) : onClose());
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
  // Titles are large, inside each screen (v9.1); a deeper page that has none of its own gets one here.
  const pageTitle = page?.kind === 'community' ? COMMUNITY_PAGE_TITLES[page.page]
    : page?.kind === 'owner' && page.page !== 'growth' ? OWNER_PAGE_TITLES[page.page]
    : null;
  const openPerson = (id: string) => setPage({ kind: 'person', id });
  const openEmail = (start?: EmailStart) => setPage({ kind: 'email', start, key: Date.now() });

  return (
    <Overlay open onClose={goBack} align="full" screen>
      <div className="community-shell hub ah-apple app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base">
        <HubNavBar
          title=""
          subtitle={refreshing ? 'Refreshing…' : undefined}
          onBack={goBack}
          backLabel={inner ? `Back to ${inner.label}` : page ? `Back to ${TAB_TITLES[tab]}` : 'Close Admin Hub'}
          backText={inner?.label ?? (page ? TAB_TITLES[tab] : undefined)}
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
            <HubBackContext.Provider value={registerBack}>
            <main ref={body} className="ah-body">
              {pageTitle && <LargeTitle title={pageTitle} />}
              {page?.kind === 'person' && (
                <PersonPage key={page.id} id={page.id} role={role} selfId={userId} onEmail={openEmail}
                  onChanged={() => { setPeopleKey((key) => key + 1); void reload(); }}
                  onDeleted={() => { setPage(null); setPeopleKey((key) => key + 1); void reload(); }} />
              )}
              {page?.kind === 'community' && <AdminCommunity data={data} selfId={userId} page={page.page} onPage={(next) => setPage({ kind: 'community', page: next })} onRefresh={reload} onOpenPerson={openPerson} />}
              {page?.kind === 'email' && <AdminEmail key={page.key} role={role} selfId={userId} start={page.start} />}
              {page?.kind === 'owner' && page.page === 'backers' && (
                <AdminBackers pendingClaims={data.pendingBackers} onReviewClaims={() => setBackersOpen(true)} onEmail={openEmail} onOpenPerson={openPerson} />
              )}
              {page?.kind === 'owner' && page.page !== 'backers' && <AdminOwner data={data} page={page.page} onPage={(next) => setPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onRefresh={reload} />}
              {!page && tab === 'home' && (
                <AdminHome data={data} onQueue={(filter) => { setQueueFilter(filter); setTab('queue'); }}
                  onBroadcast={() => (can(role, 'broadcast') ? setPage({ kind: 'community', page: 'broadcast' }) : setTab('community'))}
                  onOwner={(next) => { setTab('owner'); if (next) setPage({ kind: 'owner', page: next }); }} />
              )}
              {!page && tab === 'queue' && <AdminQueue data={data} filter={queueFilter} onFilter={setQueueFilter} onRefresh={reload} onOpenBackers={() => setBackersOpen(true)} onOpenPerson={openPerson} />}
              {!page && tab === 'people' && <PeopleList key={peopleKey} role={role} onOpen={openPerson} onEmail={() => openEmail()} />}
              {!page && tab === 'community' && <AdminCommunity data={data} selfId={userId} page={null} onPage={(next) => setPage({ kind: 'community', page: next })} onRefresh={reload} />}
              {!page && tab === 'owner' && <AdminOwner data={data} page={null} onPage={(next) => setPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onRefresh={reload} />}
            </main>
            </HubBackContext.Provider>
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
