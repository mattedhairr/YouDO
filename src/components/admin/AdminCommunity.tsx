import { useState } from 'react';
import { ChevronRight, Hash, History, Megaphone, MessageCircle, Quote, ShieldCheck, Star } from 'lucide-react';
import { LargeTitle } from './AdminUI';
import { saveCommunitySettings } from '../../lib/community';
import { describeCommunityAudit } from '../../lib/communityAudit';
import { hapticTick } from '../../lib/haptics';
import { can } from '../../lib/adminHub';
import Toggle from '../Toggle';
import CommunityHashtagManager from '../community/CommunityHashtagManager';
import CommunityQuoteAdmin from '../community/CommunityQuoteAdmin';
import AdminBroadcast from './AdminBroadcast';
import AdminRoomMembersSheet from './AdminRoomMembersSheet';
import type { AdminHubData } from './useAdminHubData';
import type { CommunityPage } from './adminHubShared';

const ago = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Row({ icon: Icon, tone, title, text, value, onClick }: {
  icon: typeof Hash; tone?: 'green' | 'amber' | 'grey'; title: string; text?: string; value?: string; onClick?: () => void;
}) {
  const body = <>
    <span className={`yd-tile ${tone ? `is-${tone}` : ''}`} aria-hidden><Icon size={16} strokeWidth={2} /></span>
    <span className="yd-row-main"><span className="yd-row-title">{title}</span>{text && <span className="yd-row-text truncate">{text}</span>}</span>
    {value && <span className="ah-value">{value}</span>}
  </>;
  return onClick
    ? <button type="button" className="yd-row" onClick={onClick}>{body}<ChevronRight size={17} className="ah-chev" aria-hidden /></button>
    : <div className="yd-row">{body}</div>;
}

export function AuditLog({ data, selfId, limit }: { data: AdminHubData; selfId: string; limit?: number }) {
  const entries = data.audit.slice(0, limit ?? data.audit.length);
  if (!entries.length) return <p className="ah-empty">Nothing recorded yet.</p>;
  return (
    <div className="yd-card">
      {entries.map((entry) => {
        const target = entry.targetUserId ? data.names.get(entry.targetUserId) : undefined;
        const who = entry.adminId ? (entry.adminId === selfId ? 'You' : data.names.get(entry.adminId) ?? 'An admin') : 'An admin';
        const description = describeCommunityAudit(entry, target);
        return (
          <div key={entry.id} className="yd-row !items-start">
            <span className="yd-tile is-grey" aria-hidden><ShieldCheck size={15} /></span>
            <span className="yd-row-main">
              <span className="yd-row-title !text-[13.5px]">{description.title}</span>
              <span className="yd-row-text">{who} · {ago(entry.createdAt)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminCommunity({ data, selfId, page, onPage, onRefresh, onOpenPerson }: {
  data: AdminHubData;
  selfId: string;
  page: CommunityPage | null;
  onPage: (page: CommunityPage) => void;
  onRefresh: () => Promise<void>;
  onOpenPerson?: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [membersRoom, setMembersRoom] = useState<{ id: string; label: string } | null>(null);
  const [status, setStatus] = useState('');
  const settings = data.context.settings;
  const owner = can(data.role, 'roomSwitches');

  if (page === 'broadcast') return owner ? <AdminBroadcast data={data} onRefresh={onRefresh} /> : null;
  if (page === 'hashtags') return (
    <div className="ah-page">
      <CommunityHashtagManager hashtags={data.hashtags} busy={saving} setupError={data.hashtagError} onRefresh={onRefresh}
        onOpenMembers={onOpenPerson ? (tag) => setMembersRoom({ id: tag.id, label: tag.label }) : undefined} />
      {onOpenPerson && <AdminRoomMembersSheet room={membersRoom} onClose={() => setMembersRoom(null)} onOpenPerson={(id) => { setMembersRoom(null); onOpenPerson(id); }} />}
    </div>
  );
  if (page === 'quotes') return <div className="ah-page"><CommunityQuoteAdmin quotes={data.quotes} busy={saving} setupError={data.quoteError} onRefresh={onRefresh} /></div>;
  if (page === 'log') return <div className="ah-page"><AuditLog data={data} selfId={selfId} /></div>;

  const toggle = async (key: 'roomEnabled' | 'appreciationsEnabled') => {
    if (saving) return;
    setSaving(true); setStatus('');
    const ok = await saveCommunitySettings({ ...settings, [key]: !settings[key] });
    setStatus(ok ? 'Saved.' : 'Could not save. Try again.');
    if (ok) { hapticTick(); await onRefresh(); }
    setSaving(false);
  };
  const activeTags = data.hashtags.filter((tag) => tag.active);
  const liveQuotes = data.quotes.filter((quote) => quote.active).length;

  const latest = data.audit[0];
  const latestText = latest ? (() => {
    const who = latest.adminId ? (latest.adminId === selfId ? 'You' : data.names.get(latest.adminId) ?? 'An admin') : 'An admin';
    return `${describeCommunityAudit(latest, latest.targetUserId ? data.names.get(latest.targetUserId) : undefined).title} · ${who}`;
  })() : 'Nothing recorded yet';
  const broadcast = settings.announcement.trim();
  const activity = data.activity ? `${data.activity.boardMembers} on the Board · ${data.activity.activeRecently} active now` : undefined;

  return (
    <div className="ah-page">
      <LargeTitle title="Community" subtitle={activity} />
      <section className="yd-section">
        <div className="yd-card">
          <div className="yd-row">
            <span className="yd-tile" aria-hidden><MessageCircle size={16} strokeWidth={2} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Community room</span>
              <span className="yd-row-text">{settings.roomEnabled ? 'Chat for Board members' : 'Paused for everyone'}</span></span>
            {owner ? <Toggle checked={settings.roomEnabled} disabled={saving} onChange={() => void toggle('roomEnabled')} label="Community room" />
              : <span className="ah-value">{settings.roomEnabled ? 'On' : 'Off'}</span>}
          </div>
          <div className="yd-row">
            <span className="yd-tile is-amber" aria-hidden><Star size={16} strokeWidth={2} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Kudos</span>
              <span className="yd-row-text">{settings.appreciationsEnabled ? 'Recognition for the top three' : 'Paused'}</span></span>
            {owner ? <Toggle checked={settings.appreciationsEnabled} disabled={saving} onChange={() => void toggle('appreciationsEnabled')} label="Kudos" />
              : <span className="ah-value">{settings.appreciationsEnabled ? 'On' : 'Off'}</span>}
          </div>
        </div>
        <p className="yd-note">{owner ? 'Only you can turn these off.' : 'The switches and the broadcast are the owner’s.'}</p>
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">Manage</h3>
        <div className="yd-card">
          {owner && <Row icon={Megaphone} title="Board broadcast" text={broadcast ? `“${broadcast.slice(0, 60)}${broadcast.length > 60 ? '…' : ''}”` : 'Nothing live'} onClick={() => onPage('broadcast')} />}
          <Row icon={Hash} tone="green" title="Hashtag rooms" value={activeTags.length ? String(activeTags.length) : 'None yet'} onClick={() => onPage('hashtags')} />
          <Row icon={Quote} tone="amber" title="Header quotes" value={liveQuotes ? String(liveQuotes) : 'Built-in'} onClick={() => onPage('quotes')} />
        </div>
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">History</h3>
        <div className="yd-card">
          <Row icon={History} tone="grey" title="Activity log" text={latestText} onClick={() => onPage('log')} />
        </div>
      </section>
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
