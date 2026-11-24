import { useState } from 'react';
import { ChevronRight, Hash, History, Megaphone, MessageCircle, Quote, ShieldCheck, Star } from 'lucide-react';
import { saveCommunitySettings } from '../../lib/community';
import { describeCommunityAudit } from '../../lib/communityAudit';
import { hapticTick } from '../../lib/haptics';
import { can } from '../../lib/adminHub';
import Toggle from '../Toggle';
import CommunityHashtagManager from '../community/CommunityHashtagManager';
import CommunityQuoteAdmin from '../community/CommunityQuoteAdmin';
import AdminBroadcast from './AdminBroadcast';
import type { AdminHubData } from './useAdminHubData';
import type { CommunityPage } from './adminHubShared';

const ago = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Row({ icon: Icon, title, text, on, onClick }: { icon: typeof Hash; title: string; text: string; on?: boolean; onClick?: () => void }) {
  const body = <>
    <span className="yd-tile" aria-hidden><Icon size={19} strokeWidth={1.8} /></span>
    <span className="yd-row-main"><span className="yd-row-title">{title}</span><span className={`yd-row-text ${on ? 'is-on' : ''}`}>{text}</span></span>
  </>;
  return onClick
    ? <button type="button" className="yd-row" onClick={onClick}>{body}<ChevronRight size={17} className="shrink-0 text-content-muted" aria-hidden /></button>
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
            <span className="yd-tile !size-8 !rounded-[10px]" aria-hidden><ShieldCheck size={15} /></span>
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

export default function AdminCommunity({ data, selfId, page, onPage, onRefresh }: {
  data: AdminHubData;
  selfId: string;
  page: CommunityPage | null;
  onPage: (page: CommunityPage) => void;
  onRefresh: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const settings = data.context.settings;
  const owner = can(data.role, 'roomSwitches');

  if (page === 'broadcast') return owner ? <AdminBroadcast data={data} onRefresh={onRefresh} /> : null;
  if (page === 'hashtags') return <div className="ah-page"><CommunityHashtagManager hashtags={data.hashtags} busy={saving} setupError={data.hashtagError} onRefresh={onRefresh} /></div>;
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

  return (
    <div className="ah-page">
      <section className="yd-section">
        <h3 className="yd-heading">Room</h3>
        <div className="yd-card">
          <div className="yd-row">
            <span className="yd-tile" aria-hidden><MessageCircle size={19} strokeWidth={1.8} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Community room</span>
              <span className={`yd-row-text ${settings.roomEnabled ? 'is-on' : ''}`}>{settings.roomEnabled ? 'On' : 'Paused for everyone'}</span></span>
            {owner && <Toggle checked={settings.roomEnabled} disabled={saving} onChange={() => void toggle('roomEnabled')} label="Community room" />}
          </div>
          <div className="yd-row">
            <span className="yd-tile" aria-hidden><Star size={19} strokeWidth={1.8} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Kudos</span>
              <span className={`yd-row-text ${settings.appreciationsEnabled ? 'is-on' : ''}`}>{settings.appreciationsEnabled ? 'On · recognition for the top three' : 'Paused'}</span></span>
            {owner && <Toggle checked={settings.appreciationsEnabled} disabled={saving} onChange={() => void toggle('appreciationsEnabled')} label="Kudos" />}
          </div>
          <Row icon={Megaphone} title="Board broadcast" on={Boolean(settings.announcement.trim())}
            text={settings.announcement.trim() ? `Live · “${settings.announcement.trim().slice(0, 60)}${settings.announcement.trim().length > 60 ? '…' : ''}”` : 'Nothing live'}
            onClick={owner ? () => onPage('broadcast') : undefined} />
        </div>
        {!owner && <p className="yd-note">The room switches and the broadcast are the owner’s.</p>}
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">Hashtags and quotes</h3>
        <div className="yd-card">
          <Row icon={Hash} title="Hashtag rooms" text={activeTags.length ? `${activeTags.length} rooms · ${activeTags.slice(0, 3).map((tag) => `#${tag.label}`).join(' ')}` : 'None yet'} onClick={() => onPage('hashtags')} />
          <Row icon={Quote} title="Header quotes" text={liveQuotes ? `${liveQuotes} active` : 'Using the built-in quotes'} onClick={() => onPage('quotes')} />
        </div>
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">Activity log</h3>
        <AuditLog data={data} selfId={selfId} limit={3} />
        {data.audit.length > 3 && (
          <button type="button" className="ah-btn is-ghost is-wide mt-2" onClick={() => onPage('log')}><History size={14} /> See all</button>
        )}
      </section>
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
