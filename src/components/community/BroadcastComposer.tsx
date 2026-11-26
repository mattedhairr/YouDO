import { Lock, Plus, X } from 'lucide-react';
import Toggle from '../Toggle';
import {
  ACTION_LABEL_MAX,
  POLL_MAX_OPTIONS,
  POLL_OPTION_MAX,
  UPDATE_REACTIONS,
  type UpdateExtrasDraft,
  type UpdateReply,
  type UpdateState,
} from '../../lib/boardUpdate';

const fieldClass =
  'w-full rounded-xl border border-subtle bg-base px-3 py-2 text-[12px] text-content-primary outline-none focus:border-primary';

/** Admin: the poll, private replies and action button that go out with a Board update. */
export function BroadcastExtrasEditor({
  draft,
  disabled,
  onChange,
}: {
  draft: UpdateExtrasDraft;
  disabled: boolean;
  onChange: (next: UpdateExtrasDraft) => void;
}) {
  const pollOn = draft.pollOptions.length > 0;
  const setOption = (index: number, value: string) =>
    onChange({ ...draft, pollOptions: draft.pollOptions.map((o, i) => (i === index ? value : o)) });
  const actionKind = draft.action?.kind ?? 'none';

  return (
    <div className="mt-4 space-y-4 border-t border-subtle pt-4">
      <div>
        <div className="flex flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-content-primary">Poll</p>
            <p className="text-[10.5px] text-content-muted">2–6 options, one vote each. Results show after voting.</p>
          </div>
          <Toggle
            disabled={disabled}
            checked={pollOn}
            onChange={() => onChange({ ...draft, pollOptions: pollOn ? [] : ['', ''] })}
            label="Add a poll"
          />
        </div>
        {pollOn && (
          <div className="mt-2.5 space-y-2">
            {draft.pollOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  disabled={disabled}
                  maxLength={POLL_OPTION_MAX}
                  onChange={(e) => setOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  aria-label={`Poll option ${index + 1}`}
                  className={fieldClass}
                />
                {draft.pollOptions.length > 2 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...draft, pollOptions: draft.pollOptions.filter((_, i) => i !== index) })}
                    aria-label={`Remove option ${index + 1}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-content-muted"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {draft.pollOptions.length < POLL_MAX_OPTIONS && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, pollOptions: [...draft.pollOptions, ''] })}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary"
              >
                <Plus size={13} /> Add option
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-nowrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-content-primary">Reply privately</p>
          <p className="text-[10.5px] text-content-muted">Members can send you a short reply. Only admins see replies.</p>
        </div>
        <Toggle
          disabled={disabled}
          checked={draft.allowReplies}
          onChange={() => onChange({ ...draft, allowReplies: !draft.allowReplies })}
          label="Allow private replies"
        />
      </div>

      <div>
        <p className="text-[12px] font-semibold text-content-primary">Action button</p>
        <div className="mt-2 flex gap-1 rounded-xl border border-subtle bg-base p-1" role="radiogroup" aria-label="Action button">
          {([['none', 'None'], ['updater', 'Check for updates'], ['link', 'Link']] as const).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={actionKind === kind}
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...draft,
                  action:
                    kind === 'none' ? null
                      : kind === 'updater' ? { kind: 'updater', label: 'Check for updates' }
                        : { kind: 'link', label: draft.action?.label && draft.action.kind === 'link' ? draft.action.label : '', url: draft.action?.kind === 'link' ? draft.action.url : '' },
                })
              }
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                actionKind === kind ? 'bg-elevated text-content-primary shadow-sm' : 'text-content-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.action && (
          <div className="mt-2 space-y-2">
            <input
              value={draft.action.label}
              disabled={disabled}
              maxLength={ACTION_LABEL_MAX}
              onChange={(e) => onChange({ ...draft, action: { ...draft.action!, label: e.target.value } })}
              placeholder="Button label"
              aria-label="Button label"
              className={fieldClass}
            />
            {draft.action.kind === 'link' && (
              <>
                <input
                  value={draft.action.url}
                  disabled={disabled}
                  inputMode="url"
                  onChange={(e) => onChange({ ...draft, action: { kind: 'link', label: draft.action!.label, url: e.target.value } })}
                  placeholder="https://github.com/mattedhairr/YouDO/releases/latest"
                  aria-label="Link"
                  className={fieldClass}
                />
                <p className="text-[10px] text-content-muted">Only YouDO on GitHub or Telegram (t.me) links are allowed.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Admin: how the live update is doing: poll results, reactions and private replies. */
export function BroadcastResults({
  state,
  replies,
  names,
  busy,
  onEndPoll,
}: {
  state: UpdateState | null;
  replies: UpdateReply[];
  names: Map<string, string>;
  busy: boolean;
  onEndPoll: () => void;
}) {
  if (!state) return null;
  const reactionTotal = UPDATE_REACTIONS.reduce((sum, emoji) => sum + (state.reactions[emoji] ?? 0), 0);
  if (!state.poll && !state.replies && reactionTotal === 0) return null;
  return (
    <div className="mt-4 space-y-3 rounded-[16px] border border-subtle bg-base p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-content-muted">Live update</p>
      {state.poll && (
        <div className="space-y-1.5">
          {state.poll.options.map((option, index) => {
            const count = state.poll!.counts?.[index] ?? 0;
            const pct = state.poll!.total > 0 ? Math.round((count / state.poll!.total) * 100) : 0;
            return (
              <div key={option} className="relative overflow-hidden rounded-lg border border-subtle px-2.5 py-1.5 text-[11.5px]">
                <span className="absolute inset-y-0 left-0 bg-primary-soft" style={{ width: `${pct}%` }} aria-hidden />
                <span className="relative flex justify-between gap-2">
                  <span className="text-content-primary">{option}</span>
                  <span className="tabular-nums text-content-secondary">{count} · {pct}%</span>
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10.5px] text-content-muted">
              {state.poll.closed && <Lock size={10} aria-hidden />}
              {state.poll.total} {state.poll.total === 1 ? 'vote' : 'votes'}{state.poll.closed ? ' · ended' : ''}
            </span>
            {!state.poll.closed && (
              <button type="button" disabled={busy} onClick={onEndPoll} className="text-[11px] font-semibold text-error">
                End poll
              </button>
            )}
          </div>
        </div>
      )}
      {reactionTotal > 0 && (
        <p className="text-[12px] text-content-secondary">
          {UPDATE_REACTIONS.filter((emoji) => state.reactions[emoji]).map((emoji) => `${emoji} ${state.reactions[emoji]}`).join('   ')}
        </p>
      )}
      {state.replies && (
        <div>
          <p className="text-[11.5px] font-semibold text-content-primary">Private replies ({replies.length})</p>
          {replies.length === 0 ? (
            <p className="mt-1 text-[10.5px] text-content-muted">No replies yet.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {replies.map((reply) => (
                <li key={reply.userId} className="rounded-lg bg-surface px-2.5 py-2 text-[11.5px]">
                  <p className="font-semibold text-content-primary">{names.get(reply.userId) ?? 'Board member'}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-content-secondary">{reply.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
