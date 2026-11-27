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
type Page = { kind: 'person'; id: string; label?: string } | { kind: 'community'; page: CommunityPage } | { kind: 'owner'; page: OwnerPage }
  | { kind: 'email'; start?: EmailStart; key: number };

/** What the back button says when it leads back to this page. */
function pageLabel(page: Page): string {
  if (page.kind === 'community') return COMMUNITY_PAGE_TITLES[page.page];
  if (page.kind === 'owner') return OWNER_PAGE_TITLES[page.page];
  if (page.kind === 'email') return 'Email';
  return page.label ?? 'Card';
}

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
  // Pages open on top of each other, so Back goes one level up (Backers → a card → back to Backers).
  const [pages, setPages] = useState<Page[]>([]);
  const page = pages.length ? pages[pages.length - 1] : null;
  const openPage = (next: Page) => setPages((list) => [...list, next]);
  const closePage = useCallback(() => setPages((list) => list.slice(0, -1)), []);
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
    setBackStep('admin', inner ? inner.back : page ? closePage : null);
    return () => setBackStep('admin', null);
  }, [page, inner, closePage]);
  useEffect(() => { body.current?.scrollTo?.(0, 0); }, [tab, page, inners.length]);
  // The Settings button's count follows what was handled here.
  useEffect(() => () => { window.dispatchEvent(new Event(ADMIN_QUEUE_EVENT)); }, []);

  const goBack = () => (inner ? inner.back() : page ? closePage() : onClose());
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
  const openPerson = (id: string) => openPage({ kind: 'person', id });
  const openEmail = (start?: EmailStart) => openPage({ kind: 'email', start, key: Date.now() });
  const backTo = inner?.label ?? (pages.length > 1 ? pageLabel(pages[pages.length - 2]) : page ? TAB_TITLES[tab] : undefined);
  // A card names its person once loaded, so a page opened from it can say "‹ Anjali".
  const namePerson = (id: string, label: string) => setPages((list) => list.map((item) => (
    item.kind === 'person' && item.id === id && item.label !== label ? { ...item, label } : item)));

  return (
    <Overlay open onClose={goBack} align="full" screen>
      <div className="community-shell hub ah-apple app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base">
        <HubNavBar
          title=""
          subtitle={refreshing ? 'Refreshing…' : undefined}
          onBack={goBack}
          backLabel={backTo ? `Back to ${backTo}` : 'Close Admin Hub'}
          backText={backTo}
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
                  onLoaded={(label) => namePerson(page.id, label)}
                  onChanged={() => { setPeopleKey((key) => key + 1); void reload(); }}
                  onDeleted={() => { closePage(); setPeopleKey((key) => key + 1); void reload(); }} />
              )}
              {page?.kind === 'community' && <AdminCommunity data={data} selfId={userId} page={page.page} onPage={(next) => openPage({ kind: 'community', page: next })} onRefresh={reload} onOpenPerson={openPerson} />}
              {page?.kind === 'email' && <AdminEmail key={page.key} role={role} selfId={userId} start={page.start} />}
              {page?.kind === 'owner' && page.page === 'backers' && (
                <AdminBackers pendingClaims={data.pendingBackers} onReviewClaims={() => setBackersOpen(true)} onEmail={openEmail} onOpenPerson={openPerson} />
              )}
              {page?.kind === 'owner' && page.page !== 'backers' && <AdminOwner data={data} page={page.page} onPage={(next) => openPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onRefresh={reload} />}
              {!page && tab === 'home' && (
                <AdminHome data={data} onQueue={(filter) => { setQueueFilter(filter); setTab('queue'); }}
                  onBroadcast={() => (can(role, 'broadcast') ? openPage({ kind: 'community', page: 'broadcast' }) : setTab('community'))}
                  onOwner={(next) => { setTab('owner'); if (next) openPage({ kind: 'owner', page: next }); }} />
              )}
              {!page && tab === 'queue' && <AdminQueue data={data} filter={queueFilter} onFilter={setQueueFilter} onRefresh={reload} onOpenBackers={() => setBackersOpen(true)} onOpenPerson={openPerson} />}
              {!page && tab === 'people' && <PeopleList key={peopleKey} role={role} onOpen={openPerson} onEmail={() => openEmail()} />}
              {!page && tab === 'community' && <AdminCommunity data={data} selfId={userId} page={null} onPage={(next) => openPage({ kind: 'community', page: next })} onRefresh={reload} />}
              {!page && tab === 'owner' && <AdminOwner data={data} page={null} onPage={(next) => openPage({ kind: 'owner', page: next })} onOpenPerson={openPerson} onRefresh={reload} />}
            </main>
            </HubBackContext.Provider>
            <nav className="ah-tabs" role="tablist" aria-label="Admin Hub">
              {tabs.map(({ id, label, icon: Icon }) => {
                const count = id === 'queue' ? counts.all : 0;
                return (
                  <button key={id} type="button" role="tab" className="ah-tab" aria-selected={!page && tab === id}
                    aria-label={count ? `${label}, ${count} waiting` : label}
                    onClick={() => { setPages([]); setTab(id); if (id === 'queue') setQueueFilter('all'); }}>
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
