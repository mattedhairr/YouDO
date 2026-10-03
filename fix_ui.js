const fs = require('fs');
let content = fs.readFileSync('src/components/CommunitySheet.tsx', 'utf8');

const oldPulse = \<section className="admin-activity" aria-label="Community pulse">
          <div className="admin-activity-heading"><div><Activity size={14} /><h3>Community pulse</h3></div><span>{activity ? 'Board members' : refreshing ? 'Loading…' : 'Unavailable'}</span></div>
          {activity ? <>
            <div className="admin-activity-values">
              <div><strong>{activity.activeRecently}</strong><span>Active recently</span><small>last 5 min</small></div>
              <div><strong>{activity.visitedToday}</strong><span>Used today</span><small>of {activity.boardMembers} members</small></div>
            </div>
            <details><summary>How pulse works <ChevronDown size={12} /></summary><p>Opted-in Board members using a supported build. Recent activity means the app was open within five minutes; someone may have since left. Used today resets at 00:00 UTC (05:30 in India). Updated {timeLabel(activity.asOf)}.</p></details>
          </> : <p className="px-4 pb-4 text-[12px] text-content-muted">{refreshing ? 'Loading activity…' : 'Activity is unavailable. Refresh to try again.'}</p>}
        </section>\;

const newPulse = \<section className="mb-6 rounded-[24px] bg-gradient-to-br from-surface to-base border border-subtle overflow-hidden shadow-sm" aria-label="Community pulse">
          <div className="flex items-center justify-between px-5 py-4 border-b border-subtle/40 bg-surface/40">
            <div className="flex items-center gap-2.5 text-primary">
              <div className="grid place-items-center size-7 rounded-lg bg-primary/10">
                <Activity size={15} className="animate-pulse" />
              </div>
              <h3 className="text-[13px] font-bold tracking-wide">Community Pulse</h3>
            </div>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">{activity ? 'Board members' : refreshing ? 'Loading...' : 'Unavailable'}</span>
          </div>
          {activity ? <>
            <div className="grid grid-cols-2 divide-x divide-subtle/50 p-5">
              <div className="flex flex-col items-center justify-center text-center px-2">
                <strong className="text-3xl font-extrabold text-content-primary mb-1.5">{activity.activeRecently}</strong>
                <span className="text-[10px] font-bold text-content-secondary uppercase tracking-widest">Active recently</span>
                <small className="text-[9px] text-content-muted mt-1">last 5 min</small>
              </div>
              <div className="flex flex-col items-center justify-center text-center px-2">
                <strong className="text-3xl font-extrabold text-content-primary mb-1.5">{activity.visitedToday}</strong>
                <span className="text-[10px] font-bold text-content-secondary uppercase tracking-widest">Used today</span>
                <small className="text-[9px] text-content-muted mt-1">of {activity.boardMembers} members</small>
              </div>
            </div>
            <details className="group border-t border-subtle/40 text-[11px]">
              <summary className="flex items-center justify-center gap-1.5 py-3 text-content-muted cursor-pointer hover:text-content-secondary hover:bg-surface/50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">How pulse works</span>
                <ChevronDown size={13} className="transition-transform duration-300 group-open:-rotate-180" />
              </summary>
              <div className="px-5 pb-5 text-content-secondary leading-relaxed text-center opacity-0 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-2 duration-300">
                Opted-in Board members using a supported build. Recent activity means the app was open within five minutes; someone may have since left. Used today resets at 00:00 UTC (05:30 in India). Updated {timeLabel(activity.asOf)}.
              </div>
            </details>
          </> : <p className="p-6 text-center text-[12px] text-content-muted">{refreshing ? 'Loading activity...' : 'Activity is unavailable. Refresh to try again.'}</p>}
        </section>\;

const oldNav = \<nav className="admin-nav" aria-label="Admin sections">{(['review', 'hashtags', 'controls', 'quotes', 'history'] as const).map((tab) => <button key={tab} type="button" aria-pressed={adminTab === tab} onClick={() => { setAdminTab(tab); setStatus(''); }}>{tab === 'review' ? 'Review' : tab === 'hashtags' ? 'Hashtags' : tab === 'controls' ? 'Controls' : tab === 'quotes' ? 'Quotes' : 'Safety log'}{tab === 'review' && reports.length + appeals.length > 0 && <span>{reports.length + appeals.length}</span>}{tab === 'hashtags' && hashtagRequests.length > 0 && <span>{hashtagRequests.length}</span>}</button>)}</nav>\;

const newNav = \<nav className="flex items-center gap-2 overflow-x-auto border-b border-subtle pb-4 mb-5" style={{ scrollbarWidth: 'none' }} aria-label="Admin sections">
          {(['review', 'hashtags', 'controls', 'quotes', 'history'] as const).map((tab) => {
            const label = tab === 'review' ? 'Review' : tab === 'hashtags' ? 'Hashtags' : tab === 'controls' ? 'Controls' : tab === 'quotes' ? 'Quotes' : 'Safety log';
            const count = tab === 'review' ? reports.length + appeals.length : tab === 'hashtags' ? hashtagRequests.length : 0;
            const active = adminTab === tab;
            return (
              <button key={tab} type="button" aria-pressed={active} onClick={() => { setAdminTab(tab); setStatus(''); }} className={\elative shrink-0 flex items-center gap-2 h-9 px-4 rounded-full text-[11.5px] font-bold transition-all duration-200 ease-out active:scale-95 \\}>
                <span>{label}</span>
                {count > 0 && <span className={\grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[9.5px] font-extrabold \\}>{count}</span>}
              </button>
            );
          })}
        </nav>\;

const oldControls = \<section className="admin-control-list">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-content-primary">Community room</p><p className="text-[10px] text-content-muted">Pause messages and automatic notes</p></div><Toggle disabled={busy || savingFeature} checked={context.settings.roomEnabled} onChange={() => void setFeature('roomEnabled', !context.settings.roomEnabled)} label="Toggle community room" /></div>
          <div className="my-3 h-px bg-border-subtle" />
          <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-content-primary">Kudos</p><p className="text-[10px] text-content-muted">Recognition for the top three</p></div><Toggle disabled={busy || savingFeature} checked={context.settings.appreciationsEnabled} onChange={() => void setFeature('appreciationsEnabled', !context.settings.appreciationsEnabled)} label="Toggle Kudos" /></div>
        </section>
        <section className="mt-4 rounded-[15px] border border-subtle bg-surface p-3.5"><label htmlFor="community-announcement" className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Board broadcast</label><textarea id="community-announcement" value={announcement} onChange={(event) => { announcementDirty.current = true; setAnnouncement(event.target.value); }} rows={4} placeholder="Optional message shown above the community room" className="mt-2 w-full resize-y rounded-xl border border-subtle bg-base px-3 py-2.5 text-[12px] outline-none focus:border-primary" /><p className="mt-1.5 text-[9.5px] leading-relaxed text-content-muted">Long broadcasts stay folded in the room until a member opens them.</p><button type="button" onClick={() => void saveSettings()} disabled={busy || savingFeature || announcement.trim() === context.settings.announcement} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-on-primary"><Check size={14} /> Publish</button></section>\;

const newControls = \<section className="rounded-[24px] border border-subtle bg-surface overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-subtle/50">
            <div>
              <p className="text-[13px] font-bold text-content-primary">Community room</p>
              <p className="text-[11px] text-content-muted mt-1">Pause messages and automatic notes</p>
            </div>
            <Toggle disabled={busy || savingFeature} checked={context.settings.roomEnabled} onChange={() => void setFeature('roomEnabled', !context.settings.roomEnabled)} label="Toggle community room" />
          </div>
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-[13px] font-bold text-content-primary">Kudos</p>
              <p className="text-[11px] text-content-muted mt-1">Recognition for the top three</p>
            </div>
            <Toggle disabled={busy || savingFeature} checked={context.settings.appreciationsEnabled} onChange={() => void setFeature('appreciationsEnabled', !context.settings.appreciationsEnabled)} label="Toggle Kudos" />
          </div>
        </section>
        
        <section className="mt-5 rounded-[24px] border border-subtle bg-surface p-5 shadow-sm">
          <label htmlFor="community-announcement" className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2 mb-3">
            <MessageCircle size={14} /> Board broadcast
          </label>
          <textarea id="community-announcement" value={announcement} onChange={(event) => { announcementDirty.current = true; setAnnouncement(event.target.value); }} rows={4} placeholder="Optional message shown above the community room" className="w-full resize-y rounded-[16px] border border-subtle bg-base p-3.5 text-[12.5px] text-content-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
          <p className="mt-2.5 text-[10.5px] text-content-muted">Long broadcasts stay folded in the room until a member opens them.</p>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => void saveSettings()} disabled={busy || savingFeature || announcement.trim() === context.settings.announcement} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[12px] font-bold text-on-primary shadow-sm disabled:opacity-40 transition-transform active:scale-95">
              <Check size={16} /> Publish Broadcast
            </button>
          </div>
        </section>\;

function replaceNormalized(text, target, replacement) {
  const normTarget = target.replace(/\\r\\n/g, '\\n');
  if (text.includes(normTarget)) return text.replace(normTarget, replacement);
  if (text.includes(target)) return text.replace(target, replacement);
  // fallback regex ignore whitespace differences
  return text;
}

content = replaceNormalized(content, oldPulse, newPulse);
content = replaceNormalized(content, oldNav, newNav);
content = replaceNormalized(content, oldControls, newControls);

fs.writeFileSync('src/components/CommunitySheet.tsx', content, 'utf8');
console.log('Done replacement');
