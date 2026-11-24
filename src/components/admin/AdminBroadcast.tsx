import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { notifyCommunityUpdate, saveCommunitySettings } from '../../lib/community';
import {
  closeUpdatePoll, draftFromState, draftSignature, EMPTY_UPDATE_DRAFT, publishCommunityUpdate, SERVER_UPDATE_NEEDED,
  updateResetKind, validateDraft, type UpdateExtrasDraft,
} from '../../lib/boardUpdate';
import { hapticSuccess } from '../../lib/haptics';
import { BroadcastExtrasEditor, BroadcastResults } from '../community/BroadcastComposer';
import type { AdminHubData } from './useAdminHubData';

/** The Board broadcast: written, published, notified and reset by the owner. */
export default function AdminBroadcast({ data, onRefresh }: { data: AdminHubData; onRefresh: () => Promise<void> }) {
  const settings = data.context.settings;
  const [announcement, setAnnouncement] = useState(settings.announcement);
  const [draft, setDraft] = useState<UpdateExtrasDraft>(() => draftFromState(data.update));
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [askNotify, setAskNotify] = useState(false);
  const [askReset, setAskReset] = useState(false);

  // Follow the server until the owner starts editing.
  useEffect(() => {
    if (dirty.current) return;
    setAnnouncement(settings.announcement);
    setDraft(draftFromState(data.update));
  }, [settings.announcement, data.update]);

  const published = draftSignature(settings.announcement, draftFromState(data.update));
  const changed = draftSignature(announcement, draft) !== published;
  const resetKind = updateResetKind(settings.announcement, announcement, draft);
  const edit = (next: UpdateExtrasDraft) => { dirty.current = true; setDraft(next); };
  const emptyForm = () => { dirty.current = false; setAnnouncement(''); setDraft(EMPTY_UPDATE_DRAFT); setAskReset(false); setAskNotify(false); };

  const publish = async () => {
    const problem = validateDraft(announcement, draft);
    if (problem) { setStatus(problem); return; }
    setBusy(true);
    const text = announcement.trim();
    const extras = draft.pollOptions.some((option) => option.trim()) || draft.allowReplies || !!draft.action;
    let result = await publishCommunityUpdate(text, draft);
    // A server without board_update_extras.sql can still publish plain text.
    if (!result.ok && !extras && result.error === SERVER_UPDATE_NEEDED) {
      result = (await saveCommunitySettings({ ...settings, announcement: text })) ? { ok: true } : { ok: false, error: 'Could not save.' };
    }
    setStatus(result.ok ? (text ? 'Published.' : 'Cleared.') : (result.error ?? 'Could not publish.'));
    if (result.ok) { hapticSuccess(); dirty.current = false; setAskNotify(text !== ''); await onRefresh(); }
    setBusy(false);
  };

  const removeLive = async () => {
    setBusy(true);
    let result = await publishCommunityUpdate('', EMPTY_UPDATE_DRAFT);
    if (!result.ok && result.error === SERVER_UPDATE_NEEDED) {
      result = (await saveCommunitySettings({ ...settings, announcement: '' })) ? { ok: true } : { ok: false, error: 'Could not save.' };
    }
    setStatus(result.ok ? 'Broadcast removed.' : (result.error ?? 'Could not remove the broadcast.'));
    if (result.ok) { hapticSuccess(); emptyForm(); await onRefresh(); } else setAskReset(false);
    setBusy(false);
  };

  const notify = async () => {
    setBusy(true);
    const result = await notifyCommunityUpdate();
    setAskNotify(false);
    setStatus(!result.ok ? (result.error ?? 'Could not send the notification.')
      : result.sent ? `Sent to ${result.sent} ${result.sent === 1 ? 'member' : 'members'}.` : 'No one to notify yet, or this one was already sent.');
    setBusy(false);
  };

  const endPoll = async () => {
    setBusy(true);
    const result = await closeUpdatePoll();
    setStatus(result.ok ? 'Poll ended.' : (result.error ?? 'Could not end the poll.'));
    await onRefresh();
    setBusy(false);
  };

  return (
    <div className="ah-page">
      <section className="yd-card">
        <div className="yd-block">
          <label htmlFor="admin-broadcast" className="yd-label">Message</label>
          <textarea id="admin-broadcast" value={announcement} rows={4} placeholder="Shown above the community room"
            onChange={(event) => { dirty.current = true; setAnnouncement(event.target.value); }}
            className="w-full resize-y rounded-[16px] border border-subtle bg-base p-3.5 text-[13px] text-content-primary outline-none focus:border-primary" />
          <p className="ah-note mt-2">Long broadcasts stay folded in the room until a member opens them.</p>
          {announcement.trim() && <BroadcastExtrasEditor draft={draft} disabled={busy} onChange={edit} />}
          <div className="ah-actions mt-4 justify-end">
            {resetKind && !askReset && (
              <button type="button" className="ah-btn is-danger mr-auto" disabled={busy} onClick={() => (resetKind === 'live' ? setAskReset(true) : emptyForm())}>
                <RotateCcw size={14} /> Reset
              </button>
            )}
            <button type="button" className="ah-btn is-primary" disabled={busy || !changed} onClick={() => void publish()}>
              <Check size={15} /> Publish
            </button>
          </div>
          {askReset && resetKind === 'live' && (
            <div role="alertdialog" aria-labelledby="ah-reset-title" className="ah-danger">
              <h4 id="ah-reset-title">Remove this broadcast for everyone?</h4>
              <p>The message, poll and button leave the room, with the poll results and replies. No one is notified.</p>
              <div className="ah-actions mt-3 justify-end">
                <button type="button" className="ah-btn is-ghost" disabled={busy} onClick={() => setAskReset(false)}>Cancel</button>
                <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void removeLive()}>Remove for everyone</button>
              </div>
            </div>
          )}
          {askNotify && (
            <div role="alertdialog" aria-labelledby="ah-notify-title" className="mt-4 rounded-[16px] border border-primary/25 bg-primary-soft/30 p-3.5">
              <p id="ah-notify-title" className="text-[13px] font-bold text-content-primary">Notify everyone?</p>
              <p className="mt-1 text-[12px] leading-relaxed text-content-secondary">Send this as a notification to Board members. Skip it for small fixes, so phones only buzz for real news.</p>
              <div className="ah-actions mt-3 justify-end">
                <button type="button" className="ah-btn is-ghost" disabled={busy} onClick={() => setAskNotify(false)}>Not now</button>
                <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void notify()}>Notify everyone</button>
              </div>
            </div>
          )}
          <BroadcastResults state={data.update} replies={data.updateReplies} names={data.names} busy={busy} onEndPoll={() => void endPoll()} />
        </div>
      </section>
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
