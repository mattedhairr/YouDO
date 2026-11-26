import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Check, ChevronLeft, ChevronRight, Copy, HelpCircle, LayoutTemplate, Pause, PenLine, Pencil, Plus, Search, Send, X } from 'lucide-react';
import { can, fetchPeople, personLabel, type AdminRole } from '../../lib/adminHub';
import {
  createEmailSend, deleteTemplate, fetchBackers, fetchEmailOverview, fetchSelfName, fetchSendDetail, fetchEmailReach, fetchTemplates, previewRecipient, saveTemplate, sendNextEmails, sendStatus, sendTestEmail,
  type Backer, type EmailAudience, type EmailOverview, type EmailProgress, type EmailSendDetail, type EmailSendSummary, type EmailTemplate, type RecipientStatus,
} from '../../lib/adminEmail';
import { EMAIL_CODES, EMAIL_FIXED, aiTemplatePrompt } from '../../lib/emailHelp';
import { EMAIL_KINDS, emailProblem, formatRupees, OFFERED_KINDS, PREVIEW_STOP_URL, renderEmail, type EmailKind } from '../../../supabase/functions/_shared/emailTemplate.ts';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';
import Overlay from '../Overlay';
import { LargeTitle, NumberStrip, Segmented } from './AdminUI';

/** How the Email page opens: from People (blank), a person's card, or Backers. */
export interface EmailStart {
  audience: EmailAudience;
  kind: EmailKind;
  people?: { id: string; label: string }[];
}

/** What is being written. `base` is the text it started from (a template or the built-in one), to know whether it was changed. */
type Draft = {
  kind: EmailKind; audience: EmailAudience; people: { id: string; label: string }[]; subject: string; body: string;
  templateId?: string; base?: { subject: string; body: string };
};

/** The address people see an Admin Hub email come from (the admin-email function's sender). */
const SENDER = 'team.youdo.app@gmail.com';

const DRAFT_KEY = 'youdo-admin-email-draft-v1';
const readDraft = (): Draft | null => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null; } catch { return null; }
};
const writeDraft = (draft: Draft | null) => {
  try { if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
};
const fresh = (kind: EmailKind, audience: EmailAudience, people: Draft['people'] = []): Draft => {
  const text = { subject: EMAIL_KINDS[kind].subject, body: EMAIL_KINDS[kind].body };
  return { kind, audience, people, ...text, base: text };
};
/** Nothing written yet beyond the text it started from. */
const untouched = (draft: Draft) => {
  const base = draft.base ?? { subject: EMAIL_KINDS[draft.kind].subject, body: EMAIL_KINDS[draft.kind].body };
  return draft.subject === base.subject && draft.body === base.body;
};
/** A retired look (News) becomes a Note wherever it would come back: a saved draft or an old template. */
const offered = (kind: EmailKind): EmailKind => (OFFERED_KINDS.includes(kind) ? kind : 'note');
const fromTemplate = (draft: Draft, template: EmailTemplate): Draft => ({
  ...draft, kind: offered(template.kind), subject: template.subject, body: template.body, templateId: template.id,
  base: { subject: template.subject, body: template.body },
});
const audienceLabel = (item: Pick<EmailSendSummary, 'audience' | 'total'>) =>
  item.audience === 'people' ? (item.total === 1 ? 'One person' : `${item.total} picked people`) : item.audience === 'backers' ? 'Backers' : 'Everyone';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Admin Hub → People → Email (v9.1, like Mail): a calm home with what was sent,
 * and New email on its own full screen, with To, Look and Subject in one card,
 * Write | Preview, and Send that asks once. One send goes out about one a
 * second while the Admin Hub is open; the list keeps each one and can send the
 * rest later (Gmail allows about 450 a day).
 */
export default function AdminEmail({ role, selfId, start }: { role: AdminRole; selfId: string; start?: EmailStart }) {
  const owner = can(role, 'money');
  const [overview, setOverview] = useState<EmailOverview | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    if (start) return fresh(start.kind, start.audience, start.people ?? []);
    const saved = readDraft();
    return saved && (owner || (saved.audience !== 'backers' && saved.kind !== 'thanks')) ? { ...saved, kind: offered(saved.kind) } : fresh('note', 'everyone');
  });
  // Opened from a person's card or Backers: straight into writing.
  const [composing, setComposing] = useState(Boolean(start));
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [sheet, setSheet] = useState<'to' | 'templates' | 'help' | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState<{ id: string; subject: string; progress: EmailProgress } | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [replacing, setReplacing] = useState<EmailTemplate | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [openSend, setOpenSend] = useState<string | null>(null);
  const [backers, setBackers] = useState<Backer[] | null>(null);
  const [allSends, setAllSends] = useState(false);
  const stop = useRef(false);
  const alive = useRef(true);
  const text = useRef<HTMLTextAreaElement>(null);

  const reload = () => fetchEmailOverview().then(setOverview).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Email.'));
  const reloadTemplates = () => fetchTemplates().then((list) => { if (alive.current) setTemplates(list); });
  useEffect(() => {
    // Set on every mount: React may mount, unmount and mount again (Strict Mode), and a stale "gone" would drop results.
    alive.current = true;
    void reload();
    void reloadTemplates();
    return () => { alive.current = false; stop.current = true; };
  }, []);
  // Opened from Backers: start from the owner's own thank-you template once it has loaded.
  useEffect(() => {
    if (!templates || start?.kind !== 'thanks') return;
    const thanks = templates.find((template) => template.kind === 'thanks');
    if (thanks) setDraft((current) => (untouched(current) && !current.templateId ? fromTemplate(current, thanks) : current));
  }, [templates, start?.kind]);
  useEffect(() => { if (!start) writeDraft(untouched(draft) && draft.audience === 'everyone' ? null : draft); }, [draft, start]);
  useEffect(() => {
    if (draft.audience !== 'people') { setReach(null); return; }
    let live = true;
    fetchEmailReach(draft.people.map((person) => person.id)).then((count) => { if (live) setReach(count); }).catch(() => { if (live) setReach(null); });
    return () => { live = false; };
  }, [draft.audience, draft.people]);

  const edit = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setConfirming(false); };
  // A template replaces the words; once something was written, it asks first.
  const startFrom = (template: EmailTemplate) => {
    if (untouched(draft) || !draft.body.trim()) { setDraft((current) => fromTemplate(current, template)); setReplacing(null); setSheet(null); }
    else setReplacing(template);
    setConfirming(false);
  };
  const saveAsTemplate = async (name: string | null) => {
    setBusy(true); setStatus('');
    try {
      const current = templates?.find((template) => template.id === draft.templateId);
      const id = await saveTemplate({ id: name === null ? current?.id : undefined, name: name ?? current?.name ?? 'Template', kind: draft.kind, subject: draft.subject, body: draft.body });
      setDraft((value) => ({ ...value, templateId: id, base: { subject: value.subject, body: value.body } }));
      setStatus(name === null ? `Template “${current?.name}” updated.` : `Saved as template “${name}”.`);
      setNaming(null);
      setSheet(null);
      hapticSuccess();
      await reloadTemplates();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the template.'); }
    setBusy(false);
  };
  /** Puts a code where the cursor is (or at the end). */
  const insert = (code: string) => {
    const area = text.current;
    const at = area ? area.selectionStart : draft.body.length;
    const end = area ? area.selectionEnd : at;
    edit({ body: draft.body.slice(0, at) + code + draft.body.slice(end) });
    window.requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(at + code.length, at + code.length); });
  };

  const left = overview ? Math.max(0, overview.limit - overview.sentToday) : 0;
  const count = draft.audience === 'everyone' ? overview?.everyone ?? 0 : draft.audience === 'backers' ? overview?.backers ?? 0 : reach ?? 0;
  const problem = emailProblem(draft.subject, draft.body)
    ?? (draft.audience === 'people' && !draft.people.length ? 'Pick at least one person.' : null)
    ?? (overview && count === 0 ? 'No one here can get email yet.' : null);
  const toLabel = draft.audience === 'everyone' ? `Everyone${overview ? ` · ${overview.everyone}` : ''}`
    : draft.audience === 'backers' ? `Backers${overview ? ` · ${overview.backers}` : ''}`
    : draft.people.length === 0 ? 'Pick people' : draft.people.length === 1 ? draft.people[0].label : `${draft.people.length} people`;

  // The preview is the email exactly as one real person gets it (previewRecipient): never made-up names or amounts.
  const previewing = composing && mode === 'preview';
  const wantBackers = previewing && owner && (draft.kind === 'thanks' || draft.audience === 'backers');
  useEffect(() => {
    if (wantBackers && backers === null) fetchBackers().then(setBackers).catch(() => setBackers([]));
  }, [wantBackers, backers]);
  const [self, setSelf] = useState<{ name?: string; signer?: string } | null>(null);
  useEffect(() => {
    if (composing && self === null) fetchSelfName(selfId).then(setSelf).catch(() => setSelf({}));
  }, [composing, self, selfId]);
  const shown = useMemo(() => previewRecipient({
    audience: draft.audience,
    picked: draft.people,
    backers,
    self: { id: selfId, name: self?.name },
  }), [draft.audience, draft.people, backers, selfId, self?.name]);
  const rendered = useMemo(() => (previewing
    ? renderEmail({ kind: draft.kind, subject: draft.subject || '(No subject)', body: draft.body, name: shown.name, amount: draft.kind === 'thanks' ? shown.amount : undefined, signer: self?.signer, unsubscribeUrl: PREVIEW_STOP_URL })
    : null), [previewing, draft, shown, self?.signer]);

  const run = async (id: string, subject: string, total: number) => {
    stop.current = false;
    let progress: EmailProgress = { total, sent: 0, failed: 0, waiting: total, leftToday: left };
    setRunning({ id, subject, progress });
    while (!stop.current && alive.current) {
      try {
        const next = await sendNextEmails(id);
        progress = next;
        if (alive.current) setRunning({ id, subject, progress });
        if (!next.ok) { setStatus(next.error ?? 'Sending stopped.'); hapticWarn(); break; }
        if (next.waiting === 0) { setStatus(`Sent to ${next.sent}${next.failed ? `; ${next.failed} didn’t arrive` : ''}.`); hapticSuccess(); break; }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Sending stopped.');
        break;
      }
    }
    if (!alive.current) return;
    if (stop.current && progress.waiting) setStatus(`Paused. ${progress.waiting} still to send: open it below and tap Send the rest when you’re ready.`);
    setRunning(null);
    await reload();
  };

  const send = async () => {
    if (problem || busy) return;
    setBusy(true); setStatus('');
    try {
      const created = await createEmailSend({ ...draft, people: draft.people.map((person) => person.id) });
      writeDraft(null);
      setDraft(fresh('note', 'everyone'));
      setConfirming(false);
      setComposing(false);
      setMode('write');
      setBusy(false);
      await run(created.id, draft.subject, created.total);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send.');
      setBusy(false);
    }
  };

  const test = async () => {
    const issue = emailProblem(draft.subject, draft.body);
    if (issue) { setStatus(issue); return; }
    setBusy(true); setStatus('');
    try { setStatus(`Test sent to ${await sendTestEmail(draft.kind, draft.subject, draft.body)}. Check the inbox (and Promotions).`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'The test was not sent.'); }
    setBusy(false);
  };

  const pickAudience = (key: EmailAudience) => {
    const thanks = templates?.find((template) => template.kind === 'thanks');
    if (key === 'backers' && untouched(draft) && thanks) setDraft((value) => ({ ...fromTemplate(value, thanks), audience: key }));
    else edit({ audience: key });
  };
  const kinds = OFFERED_KINDS.filter((kind) => owner || kind !== 'thanks');
  const current = templates?.find((template) => template.id === draft.templateId);

  if (openSend) {
    const summary = overview?.sends.find((item) => item.id === openSend);
    return (
      <SendDetail id={openSend} running={running?.id === openSend ? running.progress : null}
        canSendRest={Boolean(summary && (summary.sentBy === selfId || owner)) && !running && left > 0}
        restNote={!summary || running ? '' : !(summary.sentBy === selfId || owner) ? 'Only who wrote it, or the owner, can send the rest.' : left < 1 ? `Today’s ${overview?.limit ?? 450} are used up. Send the rest when the count refills (within 24 hours).` : ''}
        onSendRest={(detail) => { setOpenSend(null); void run(detail.id, detail.subject, detail.recipients.length); }}
        onClose={() => setOpenSend(null)} />
    );
  }

  if (managing) {
    return <TemplateManager templates={templates ?? []} onClose={() => setManaging(false)} onChanged={() => reloadTemplates()} />;
  }

  // Nothing written and nobody picked: the home offers a clean New email.
  const blank = untouched(draft) && draft.audience === 'everyone';
  const waiting = overview?.sends.filter((item) => item.waiting > 0) ?? [];
  const done = overview?.sends.filter((item) => item.waiting === 0) ?? [];
  const recent = allSends ? done : done.slice(0, 3);
  const row = (item: EmailSendSummary) => (
    <button key={item.id} type="button" className="yd-row w-full" onClick={() => setOpenSend(item.id)}>
      <span className="yd-row-main">
        <span className="yd-row-title truncate">{item.subject}</span>
        <span className="yd-row-text truncate">{audienceLabel(item)} · {when(item.createdAt)}{item.sentBy !== selfId && item.sentByName ? ` · ${item.sentByName}` : ''}</span>
      </span>
      <span className={`ah-mail-state ${item.waiting ? 'is-waiting' : item.failed ? 'is-failed' : 'is-sent'}`}>
        {item.waiting ? `${item.sent} of ${item.total}` : item.failed ? `${item.failed} didn’t arrive` : item.total > 1 ? `✓ ${item.sent}` : '✓ Sent'}
      </span>
      <ChevronRight size={17} className="ah-chev" aria-hidden />
    </button>
  );

  return (
    <div className="ah-page">
      <LargeTitle title="Email" subtitle={overview ? `${left} of ${overview.limit} left today${overview.stopped ? ` · ${overview.stopped} turned email off` : ''}` : 'Opening…'} />

      {running && (
        <section className="yd-card yd-block ah-mail-running" aria-live="polite">
          <p className="ah-mail-running-title">Sending “{running.subject}”</p>
          <div className="ah-meter" aria-hidden><i style={{ width: `${((running.progress.sent + running.progress.failed) / Math.max(1, running.progress.total)) * 100}%` }} /></div>
          <p className="ah-note mt-2">{sendStatus(running.progress, true)} · about one a second. Keep the Admin Hub open; closing it pauses, and you can send the rest later.</p>
          <button type="button" className="ah-btn mt-3" onClick={() => { stop.current = true; }}><Pause size={14} /> Pause</button>
        </section>
      )}

      <button type="button" className="ah-mail-new" disabled={Boolean(running)} onClick={() => { setComposing(true); setMode('write'); setStatus(''); }}>
        <PenLine size={18} /> {blank ? 'New email' : 'Continue writing'}
      </button>
      {!blank && (
        <p className="ah-note mt-2 px-2">Draft: “{draft.subject || 'no subject yet'}” · <button type="button" className="font-semibold text-primary" onClick={() => setDraft(fresh('note', 'everyone'))}>Start over</button></p>
      )}
      {status && !composing && <p role="status" className="ah-status">{status}</p>}

      {waiting.length > 0 && (
        <section className="yd-section mt-5">
          <h3 className="yd-heading">Not finished</h3>
          <div className="yd-card">{waiting.map(row)}</div>
        </section>
      )}
      <section className="yd-section mt-5">
        <h3 className="yd-heading">Sent</h3>
        {!overview ? <p className="ah-empty">Loading…</p> : done.length === 0 ? <div className="yd-card"><p className="ah-empty !py-5">Nothing sent yet.</p></div> : (
          <div className="yd-card">
            {recent.map(row)}
            {done.length > 3 && (
              <button type="button" className="yd-row w-full justify-center !min-h-[44px] font-semibold text-primary" onClick={() => setAllSends((value) => !value)}>
                {allSends ? 'Show fewer' : `See all ${done.length}`}
              </button>
            )}
          </div>
        )}
      </section>
      {owner && (
        <div className="yd-card">
          <button type="button" className="yd-row w-full" onClick={() => setManaging(true)}>
            <span className="yd-tile is-grey" aria-hidden><LayoutTemplate size={16} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Templates</span>
              <span className="yd-row-text truncate">{templates?.length ? templates.map((template) => template.name).join(', ') : 'Saved texts to start from'}</span></span>
            <ChevronRight size={17} className="ah-chev" aria-hidden />
          </button>
        </div>
      )}
      <p className="yd-note">From {SENDER}, never the address that sends sign-in mails. Every email ends with “Stop these emails”, and each send is in the activity log.</p>

      {/* New email: its own full screen, like Mail. */}
      <Overlay open={composing} onClose={() => setComposing(false)} align="full" screen>
        <div className="community-shell hub ah-apple app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base" role="dialog" aria-label="New email">
          <header className="hub-sheet-header ah-compose-bar">
            <button type="button" className="hub-text-button is-start" onClick={() => setComposing(false)}>Cancel</button>
            <h2>New email</h2>
            <button type="button" className="ah-send is-end" disabled={busy || Boolean(running) || !overview}
              onClick={() => { if (problem) setStatus(problem); else { setStatus(''); setConfirming(true); } }}>Send</button>
          </header>
          <main className="ah-body">
            <div className="yd-card mt-2">
              <button type="button" className="yd-row ah-field" onClick={() => setSheet('to')}>
                <span className="ah-field-key">To</span>
                <span className="yd-row-main"><span className="yd-row-title truncate">{toLabel}</span></span>
                <ChevronRight size={17} className="ah-chev" aria-hidden />
              </button>
              {kinds.length > 1 && (
                <div className="yd-row ah-field">
                  <span className="ah-field-key">Look</span>
                  <div className="flex-1"><Segmented<EmailKind> label="How the email looks" value={draft.kind} onChange={(kind) => edit({ kind })}
                    options={kinds.map((kind) => ({ id: kind, label: EMAIL_KINDS[kind].label }))} /></div>
                </div>
              )}
              <label className="yd-row ah-field">
                <span className="ah-field-key">Subject</span>
                <input className="ah-field-input" value={draft.subject} maxLength={120} placeholder="What it’s about"
                  onChange={(event) => edit({ subject: event.target.value })} />
              </label>
            </div>

            <div className="mt-4"><Segmented<'write' | 'preview'> label="Write or preview" value={mode} onChange={setMode}
              options={[{ id: 'write', label: 'Write' }, { id: 'preview', label: 'Preview' }]} /></div>

            {mode === 'write' ? (
              <>
                <textarea ref={text} value={draft.body} rows={12} maxLength={6000} placeholder="Hi {name}," aria-label="Message"
                  onChange={(event) => edit({ body: event.target.value })} className="ah-compose-text" />
                <div className="ah-tools">
                  <button type="button" onClick={() => setSheet('templates')}><LayoutTemplate size={14} /> Templates</button>
                  <button type="button" onClick={() => insert('{name}')}><Plus size={14} /> Name</button>
                  {draft.kind === 'thanks' && <button type="button" onClick={() => insert('{amount}')}><Plus size={14} /> Amount</button>}
                  <button type="button" onClick={() => setSheet('help')}><HelpCircle size={14} /> Help</button>
                </div>
                <p className="yd-note">{EMAIL_KINDS[draft.kind].hint} Each person gets their own name{draft.kind === 'thanks' ? ' and amount' : ''}.</p>
              </>
            ) : rendered && (
              <MailPreview html={rendered.html} subject={rendered.subject}
                caption={`Exactly as ${shown.label} gets it${draft.kind === 'thanks' && shown.amount ? ` (${formatRupees(shown.amount)})` : ''}`} />
            )}
            <button type="button" className="ah-mail-test" disabled={busy || Boolean(running)} onClick={() => void test()}>Send me a test</button>
            {status && composing && <p role="status" className="ah-status text-center">{status}</p>}
          </main>
        </div>

        {/* Send to */}
        <Overlay open={sheet === 'to'} onClose={() => setSheet(null)} align="bottom">
          <div className="hub hub-sheet ah-apple" role="dialog" aria-label="Send to">
            <div className="hub-sheet-grabber" aria-hidden />
            <div className="hub-sheet-header"><span /><h2>Send to</h2><button type="button" className="hub-text-button is-strong is-end" onClick={() => setSheet(null)}>Done</button></div>
            <div className="hub-sheet-body">
              <div className="yd-card">
                {([
                  ['everyone', 'Everyone', overview ? `${overview.everyone} can get email` : ''],
                  ...(owner ? [['backers', 'Backers', overview ? `${overview.backers} ${overview.backers === 1 ? 'backer' : 'backers'}` : '']] : []),
                  ['people', 'Pick people', 'Up to 50, by name or @username'],
                ] as [EmailAudience, string, string][]).map(([key, label, detail]) => (
                  <button key={key} type="button" className="yd-row" role="radio" aria-checked={draft.audience === key} onClick={() => pickAudience(key)}>
                    <span className="yd-row-main"><span className="yd-row-title">{label}</span><span className="yd-row-text">{detail}</span></span>
                    {draft.audience === key && <Check size={18} className="text-primary" aria-hidden />}
                  </button>
                ))}
              </div>
              {draft.audience === 'people' && <PeoplePicker picked={draft.people} reach={reach} selfId={selfId} onChange={(people) => edit({ people })} />}
            </div>
          </div>
        </Overlay>

        {/* Templates */}
        <Overlay open={sheet === 'templates'} onClose={() => { setSheet(null); setReplacing(null); setNaming(null); }} align="bottom">
          <div className="hub hub-sheet ah-apple" role="dialog" aria-label="Templates">
            <div className="hub-sheet-grabber" aria-hidden />
            <div className="hub-sheet-header"><span /><h2>Templates</h2><button type="button" className="hub-text-button is-strong is-end" onClick={() => { setSheet(null); setReplacing(null); setNaming(null); }}>Done</button></div>
            <div className="hub-sheet-body">
              {replacing ? (
                <div className="yd-card ah-confirm-row">
                  <p>Replace what you wrote with “{replacing.name}”?</p>
                  <div className="ah-choices">
                    <button type="button" className="ah-btn" onClick={() => setReplacing(null)}>Keep mine</button>
                    <button type="button" className="ah-btn is-primary" onClick={() => { setDraft((value) => fromTemplate(value, replacing)); setReplacing(null); setSheet(null); }}>Replace</button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="yd-heading">Start from</h3>
                  {templates && templates.length > 0 ? (
                    <div className="yd-card">
                      {templates.map((template) => (
                        <button key={template.id} type="button" className="yd-row" onClick={() => startFrom(template)}>
                          <span className="yd-row-main"><span className="yd-row-title">{template.name}</span>
                            <span className="yd-row-text truncate">{EMAIL_KINDS[offered(template.kind)].label} · {template.subject || template.body.replace(/\s+/g, ' ').slice(0, 50)}</span></span>
                          {draft.templateId === template.id && <Check size={18} className="text-primary" aria-hidden />}
                        </button>
                      ))}
                    </div>
                  ) : <p className="ah-empty">No templates yet.</p>}
                  {owner && (
                    <section className="yd-section mt-5">
                      <h3 className="yd-heading">This email</h3>
                      <div className="yd-card">
                        {naming === null ? (
                          <>
                            {current && !untouched(draft) && (
                              <button type="button" className="yd-row" disabled={busy} onClick={() => void saveAsTemplate(null)}>
                                <span className="yd-row-main"><span className="yd-row-title text-primary">Update “{current.name}”</span></span>
                              </button>
                            )}
                            <button type="button" className="yd-row" disabled={busy} onClick={() => setNaming('')}>
                              <span className="yd-row-main"><span className="yd-row-title text-primary">Save as a new template…</span></span>
                            </button>
                            <button type="button" className="yd-row" onClick={() => { setSheet(null); setComposing(false); setManaging(true); }}>
                              <span className="yd-row-main"><span className="yd-row-title">Edit templates</span></span>
                              <ChevronRight size={17} className="ah-chev" aria-hidden />
                            </button>
                          </>
                        ) : (
                          <div className="ah-confirm-row">
                            <input className="yd-field mb-2.5" value={naming} maxLength={60} placeholder="Template name" aria-label="Template name" autoFocus
                              onChange={(event) => setNaming(event.target.value)} />
                            <div className="ah-choices">
                              <button type="button" className="ah-btn" onClick={() => setNaming(null)}>Cancel</button>
                              <button type="button" className="ah-btn is-primary" disabled={busy || !naming.trim()} onClick={() => void saveAsTemplate(naming.trim())}>Save</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </Overlay>

        {/* Help */}
        <Overlay open={sheet === 'help'} onClose={() => setSheet(null)} align="bottom">
          <div className="hub hub-sheet ah-apple" role="dialog" aria-label="Help">
            <div className="hub-sheet-grabber" aria-hidden />
            <div className="hub-sheet-header"><span /><h2>Writing an email</h2><button type="button" className="hub-text-button is-strong is-end" onClick={() => setSheet(null)}>Done</button></div>
            <div className="hub-sheet-body"><EmailHelp /></div>
          </div>
        </Overlay>

        {/* Send asks once. */}
        <Overlay open={confirming} onClose={() => setConfirming(false)}>
          <div className="ah-alert" role="alertdialog" aria-labelledby="ah-mail-confirm">
            <h4 id="ah-mail-confirm">Send “{draft.subject.trim()}” to {count} {count === 1 ? 'person' : 'people'}?</h4>
            <p>
              {count > left
                ? `Today ${left} can go; the other ${count - left} wait until tomorrow (Send the rest).`
                : `Each person gets their own copy; nobody sees the others.`}
              {' '}An email can’t be taken back.
            </p>
            <div className="ah-alert-buttons">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="is-strong" disabled={busy} onClick={() => void send()}><Send size={14} /> Send</button>
            </div>
          </div>
        </Overlay>
      </Overlay>
    </div>
  );
}

/**
 * An email as the person sees it in Gmail: subject, the sender, then the email
 * itself at its full height. Dark shows how Gmail's dark mode darkens it.
 */
export function MailPreview({ html, subject, caption }: { html: string; subject: string; caption: string }) {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    // The body's own height: the document's would be at least the frame's, so it could only grow.
    if (doc?.body) setHeight(Math.max(160, doc.body.scrollHeight + 2));
  };
  useEffect(() => { fit(); }, [html]);
  return (
    <div className="ah-mailview">
      <div className="ah-mailview-top">
        <p className="ah-note">{caption}</p>
        <div className="w-[128px] flex-none"><Segmented<'light' | 'dark'> label="Gmail theme" value={dark ? 'dark' : 'light'} onChange={(next) => setDark(next === 'dark')}
          options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} /></div>
      </div>
      <div className={`ah-gmail ${dark ? 'is-dark' : ''}`}>
        <div className="ah-gmail-head">
          <p className="ah-gmail-subject">{subject}</p>
          <div className="ah-gmail-from">
            <span className="ah-gmail-avatar" aria-hidden>Y</span>
            <span><b>YouDO</b> <small>&lt;{SENDER}&gt;</small><em>to me</em></span>
          </div>
        </div>
        {/* No scripts can run; links don't open from a preview. */}
        <iframe ref={frame} title="Email preview" sandbox="allow-same-origin" srcDoc={html} onLoad={fit} style={{ height }} tabIndex={-1} />
      </div>
    </div>
  );
}

/** Search people by name or @username and pick up to 50. */
function PeoplePicker({ picked, reach, selfId, onChange }: {
  picked: { id: string; label: string }[];
  reach: number | null;
  selfId: string;
  onChange: (people: { id: string; label: string }[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; label: string; detail: string }[]>([]);
  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      fetchPeople(search, 'all', 0, 8).then((page) => {
        if (live) setFound(page.people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.username ? `@${person.username}` : person.email ?? '' })));
      }).catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [search]);

  const has = new Set(picked.map((person) => person.id));
  return (
    <div className="mt-4">
      {picked.length < 50 && (
        <label className="ah-search">
          <Search size={16} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or @username" aria-label="Find people" type="search" autoComplete="off" />
        </label>
      )}
      {picked.length > 0 && (
        <div className="ah-mail-picked mt-3">
          {picked.map((person) => (
            <span key={person.id} className="ah-mail-pick">{person.id === selfId ? 'You' : person.label}
              <button type="button" aria-label={`Remove ${person.label}`} onClick={() => onChange(picked.filter((item) => item.id !== person.id))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {found.length > 0 && (
        <div className="yd-card mt-2">
          {found.filter((person) => !has.has(person.id)).map((person) => (
            <button key={person.id} type="button" className="yd-row" onClick={() => { onChange([...picked, { id: person.id, label: person.label }]); setSearch(''); }}>
              <span className="yd-row-main"><span className="yd-row-title truncate">{person.label}</span><span className="yd-row-text truncate">{person.detail}</span></span>
              <Plus size={17} className="text-primary" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {picked.length > 0 && reach !== null && (
        <p className="yd-note">{reach === picked.length ? `All ${reach} can get it.` : `${reach} of ${picked.length} can get it; the others haven’t confirmed their email or turned email off.`}</p>
      )}
    </div>
  );
}

/** Edit templates: the owner's saved texts (name, look, subject, message). */
function TemplateManager({ templates, onClose, onChanged }: { templates: EmailTemplate[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<(Omit<EmailTemplate, 'id'> & { id?: string }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setStatus('Give it a name.'); return; }
    setBusy(true); setStatus('');
    try { await saveTemplate(editing); await onChanged(); hapticSuccess(); setEditing(null); setStatus('Saved.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save.'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing?.id) return;
    setBusy(true); setStatus('');
    try { await deleteTemplate(editing.id); await onChanged(); setEditing(null); setDeleting(false); setStatus('Deleted.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not delete.'); }
    setBusy(false);
  };

  if (editing) {
    return (
      <div className="ah-page">
        <button type="button" className="ah-back-link" onClick={() => { setEditing(null); setDeleting(false); }}><ChevronLeft size={18} /> Templates</button>
        <LargeTitle title={editing.id ? 'Edit template' : 'New template'} />
        <div className="yd-card">
          <label className="yd-row ah-field">
            <span className="ah-field-key">Name</span>
            <input className="ah-field-input" value={editing.name} maxLength={60} placeholder="Personal note"
              onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
          </label>
          <div className="yd-row ah-field">
            <span className="ah-field-key">Look</span>
            <div className="flex-1"><Segmented<EmailKind> label="How the email looks" value={editing.kind} onChange={(kind) => setEditing({ ...editing, kind })}
              options={OFFERED_KINDS.map((kind) => ({ id: kind, label: EMAIL_KINDS[kind].label }))} /></div>
          </div>
          <label className="yd-row ah-field">
            <span className="ah-field-key">Subject</span>
            <input className="ah-field-input" value={editing.subject} maxLength={120} placeholder="Can be left empty"
              onChange={(event) => setEditing({ ...editing, subject: event.target.value })} />
          </label>
        </div>
        <p className="yd-note">{EMAIL_KINDS[editing.kind].hint}{editing.kind === 'thanks' ? ' Only you see thank-you templates.' : ''}</p>
        <textarea value={editing.body} rows={11} maxLength={6000} aria-label="Message"
          onChange={(event) => setEditing({ ...editing, body: event.target.value })} className="ah-compose-text mt-4" />
        <div className="ah-choices mt-4">
          <button type="button" className="ah-btn" disabled={busy} onClick={() => { setEditing(null); setDeleting(false); }}>Cancel</button>
          <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void save()}>Save</button>
        </div>
        {editing.id && !deleting && (
          <div className="yd-card mt-5"><button type="button" className="yd-row ah-cell-danger" disabled={busy} onClick={() => setDeleting(true)}>
            <span className="yd-row-main"><span className="yd-row-title">Delete template</span></span>
          </button></div>
        )}
        {deleting && (
          <div role="alertdialog" aria-labelledby="ah-tpl-delete" className="ah-danger">
            <h4 id="ah-tpl-delete">Delete “{editing.name}”?</h4>
            <p>Emails already sent from it stay as they were.</p>
            <div className="ah-choices mt-3">
              <button type="button" className="ah-btn" disabled={busy} onClick={() => setDeleting(false)}>Keep it</button>
              <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void remove()}>Delete</button>
            </div>
          </div>
        )}
        {status && <p role="status" className="ah-status">{status}</p>}
      </div>
    );
  }

  return (
    <div className="ah-page">
      <button type="button" className="ah-back-link" onClick={onClose}><ChevronLeft size={18} /> Email</button>
      <LargeTitle title="Templates" subtitle="Saved texts to start an email from" />
      {templates.length === 0 ? <div className="yd-card"><p className="ah-empty !py-5">No templates yet.</p></div> : (
        <div className="yd-card">
          {templates.map((template) => (
            <button key={template.id} type="button" className="yd-row w-full" onClick={() => { setEditing({ ...template, kind: offered(template.kind) }); setStatus(''); }}>
              <span className="yd-row-main">
                <span className="yd-row-title truncate">{template.name}</span>
                <span className="yd-row-text truncate">{EMAIL_KINDS[offered(template.kind)].label} · {template.subject || template.body.replace(/\s+/g, ' ').slice(0, 60) || 'Empty'}</span>
              </span>
              <Pencil size={15} className="ah-chev" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <div className="yd-card mt-3">
        <button type="button" className="yd-row w-full" onClick={() => setEditing({ name: '', kind: 'note', subject: '', body: 'Hi {name},\n\n' })}>
          <span className="yd-tile" aria-hidden><BookmarkPlus size={16} /></span>
          <span className="yd-row-main"><span className="yd-row-title text-primary">New template</span></span>
        </button>
      </div>
      <p className="yd-note">Admins can start from these too, except thank-yous. Changing a template never changes emails already sent.</p>
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}

/** Codes and tips for writing, with a prompt to draft a template in any AI chat. */
function EmailHelp() {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(aiTemplatePrompt()); setCopied('yes'); }
    catch { setCopied('no'); }
  };
  return (
    <div className="ah-mail-help">
      <h3 className="yd-heading">You can type</h3>
      <div className="yd-card">
        {EMAIL_CODES.map((item) => (
          <div key={item.code} className="yd-row !items-start">
            <span className="ah-help-code">{/^[{*]/.test(item.code) ? <code>{item.code}</code> : item.code}</span>
            <span className="yd-row-main"><span className="yd-row-text !mt-0">{item.meaning}</span></span>
          </div>
        ))}
      </div>
      <h3 className="yd-heading mt-5">YouDO adds by itself</h3>
      <div className="yd-card yd-block">
        <ul>{EMAIL_FIXED.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
      <h3 className="yd-heading mt-5">Draft one with AI</h3>
      <div className="yd-card yd-block">
        <p className="ah-note">Copy this prompt into any AI chat, describe the email where it says so, and paste back the subject and message it gives you.</p>
        <button type="button" className="ah-btn mt-3" onClick={() => void copy()}><Copy size={13} /> {copied === 'yes' ? 'Copied' : 'Copy AI prompt'}</button>
        {copied === 'no' && <textarea readOnly rows={8} value={aiTemplatePrompt()} aria-label="AI prompt" onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-full rounded-[12px] border border-subtle bg-base p-2.5 text-[11.5px] text-content-secondary" />}
      </div>
    </div>
  );
}

const RECIPIENT_FILTERS: { id: RecipientStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'sent', label: 'Sent' }, { id: 'waiting', label: 'Waiting' }, { id: 'failed', label: 'Didn’t arrive' },
];

/** One send: what went out, who got it, who is still waiting and why any didn't arrive. */
function SendDetail({ id, running, canSendRest, restNote, onSendRest, onClose }: {
  id: string;
  running: EmailProgress | null;
  canSendRest: boolean;
  restNote: string;
  onSendRest: (detail: EmailSendDetail) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<EmailSendDetail | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RecipientStatus | 'all'>('all');
  const [showEmail, setShowEmail] = useState(false);
  useEffect(() => {
    let live = true;
    fetchSendDetail(id).then((next) => { if (live) setDetail(next); }).catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not open this email.'); });
    return () => { live = false; };
  }, [id, running?.sent]);

  const count = (status: RecipientStatus) => detail?.recipients.filter((person) => person.status === status).length ?? 0;
  const people = detail?.recipients.filter((person) => filter === 'all' || person.status === filter) ?? [];
  // Shown exactly as the first person got it: their own name and, for a thank-you, their own amount.
  const [backers, setBackers] = useState<Backer[] | null>(null);
  const needsAmount = Boolean(detail && showEmail && (detail.kind === 'thanks' || detail.audience === 'backers'));
  useEffect(() => {
    if (needsAmount && backers === null) fetchBackers().then(setBackers).catch(() => setBackers([]));
  }, [needsAmount, backers]);
  const shownAs = useMemo(() => (detail ? previewRecipient({ audience: detail.audience, recipients: detail.recipients, backers }) : null), [detail, backers]);
  const rendered = useMemo(() => (detail && showEmail && shownAs
    ? renderEmail({ kind: detail.kind, subject: detail.subject, body: detail.body, name: shownAs.name, amount: detail.kind === 'thanks' ? shownAs.amount : undefined, signer: detail.sentByName, unsubscribeUrl: PREVIEW_STOP_URL })
    : null), [detail, showEmail, shownAs]);

  return (
    <div className="ah-page">
      <button type="button" className="ah-back-link" onClick={onClose}><ChevronLeft size={18} /> Email</button>
      {error && <p role="status" className="ah-status text-error">{error}</p>}
      {!detail && !error && <p className="ah-empty">Loading…</p>}
      {detail && (
        <>
          <LargeTitle title={detail.subject || '(No subject)'}
            subtitle={`${EMAIL_KINDS[detail.kind].label} · ${audienceLabel({ audience: detail.audience, total: detail.recipients.length })} · ${when(detail.createdAt)}${detail.sentByName ? ` · ${detail.sentByName}` : ''}`} />
          <NumberStrip label="This send" items={[
            { value: count('sent'), label: 'Sent' }, { value: count('waiting'), label: 'Waiting' }, { value: count('failed'), label: 'Didn’t arrive' },
          ]} />
          {running && <p className="ah-strip-note">Sending now · {sendStatus(running, true)}</p>}
          {!running && count('waiting') > 0 && !canSendRest && restNote && <p className="ah-strip-note">{restNote}</p>}
          <div className="yd-card mt-4">
            {count('waiting') > 0 && canSendRest && (
              <button type="button" className="yd-row" onClick={() => onSendRest(detail)}>
                <span className="yd-tile" aria-hidden><Send size={16} /></span>
                <span className="yd-row-main"><span className="yd-row-title text-primary">Send the rest</span><span className="yd-row-text">{count('waiting')} still waiting</span></span>
              </button>
            )}
            <button type="button" className="yd-row" onClick={() => setShowEmail((value) => !value)} aria-expanded={showEmail}>
              <span className="yd-row-main"><span className="yd-row-title">{showEmail ? 'Hide the email' : 'See the email'}</span></span>
              <ChevronRight size={17} className={`ah-chev transition-transform ${showEmail ? 'rotate-90' : ''}`} aria-hidden />
            </button>
          </div>
          {rendered && shownAs && (
            <div className="mt-3">
              <MailPreview html={rendered.html} subject={rendered.subject}
                caption={`Exactly as ${shownAs.label} got it${detail.kind === 'thanks' && shownAs.amount ? ` (${formatRupees(shownAs.amount)})` : ''}`} />
            </div>
          )}

          <section className="yd-section mt-5">
            <h3 className="yd-heading">People</h3>
            {detail.recipients.length > 1 && (
              <Segmented<RecipientStatus | 'all'> label="Show" value={filter} onChange={setFilter}
                options={RECIPIENT_FILTERS.map((item) => ({ id: item.id, label: `${item.label} ${item.id === 'all' ? detail.recipients.length : count(item.id)}` }))} />
            )}
            {people.length === 0 ? <div className="yd-card"><p className="ah-empty !py-5">No one here.</p></div> : (
              <div className="yd-card">
                {people.slice(0, 300).map((person) => (
                  <div key={person.id} className="yd-row">
                    <span className="yd-row-main">
                      <span className="yd-row-title truncate">{person.name ?? (person.username ? `@${person.username}` : 'No name yet')}</span>
                      {person.status === 'failed' && <span className="yd-row-text !text-error">{person.error ?? 'Didn’t arrive'}</span>}
                    </span>
                    <span className={`ah-mail-state is-${person.status}`}>
                      {person.status === 'sent' ? (person.sentAt ? when(person.sentAt) : 'Sent') : person.status === 'waiting' ? 'Waiting' : 'Not sent'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {people.length > 300 && <p className="yd-note">Showing the first 300.</p>}
          </section>
        </>
      )}
    </div>
  );
}
