import Overlay from '../Overlay';
import { Reply, Copy, Pencil, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { hapticTick, hapticWarn } from '../../lib/haptics';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export interface ChatActionSheetProps {
  open: boolean;
  onClose: () => void;
  authorName: string;
  time: string;
  body: string;
  canReply?: boolean;
  onReply?: () => void;
  canCopy?: boolean;
  onCopy?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  canDelete?: boolean;
  deleteLabel?: string;
  onDelete?: () => void;
  canReport?: boolean;
  onReport?: () => void;
  isAdmin?: boolean;
  adminReason?: string;
  onAdminReasonChange?: (reason: string) => void;
  onAdminRemove?: () => void;
  actionBusy?: boolean;
  actionError?: string;
}

export default function ChatActionSheet({
  open,
  onClose,
  authorName,
  time,
  body,
  canReply,
  onReply,
  canCopy = true,
  onCopy,
  canEdit,
  onEdit,
  canDelete,
  deleteLabel = 'Delete message',
  onDelete,
  canReport,
  onReport,
  isAdmin,
  adminReason,
  onAdminReasonChange,
  onAdminRemove,
  actionBusy = false,
  actionError = '',
}: ChatActionSheetProps) {
  if (!open) return null;

  return (
    <Overlay open={open} onClose={() => { if (!actionBusy) onClose(); }} align="bottom">
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-3">
        {/* Grab Handle */}
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70" />

        {/* Message Preview Quote Card */}
        <div className="bg-surface border border-subtle rounded-2xl p-3.5 flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-content-muted">
            <span className="font-bold text-primary">{authorName}</span>
            <span>{time}</span>
          </div>
          <p className="text-[13px] text-content-primary line-clamp-3 leading-relaxed whitespace-pre-wrap select-text">
            {body}
          </p>
        </div>

        {actionError && (
          <p className="text-xs text-error font-medium px-1" role="alert">
            {actionError}
          </p>
        )}

        {/* Actions Stack */}
        <div className="bg-surface border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle shadow-sm">
          {canReply && onReply && (
            <button
              type="button"
              disabled={actionBusy}
              className="w-full h-12 px-4 flex items-center justify-between text-[13px] font-semibold text-content-primary hover:bg-elevated active:bg-elevated transition-colors disabled:opacity-50"
              onClick={() => {
                hapticTick();
                onReply();
              }}
            >
              <span>Reply</span>
              <Reply size={17} className="text-secondary" />
            </button>
          )}

          {canCopy && body && (
            <button
              type="button"
              disabled={actionBusy}
              className="w-full h-12 px-4 flex items-center justify-between text-[13px] font-semibold text-content-primary hover:bg-elevated active:bg-elevated transition-colors disabled:opacity-50"
              onClick={async () => {
                hapticTick();
                if (onCopy) {
                  onCopy();
                } else {
                  await copyTextToClipboard(body);
                  onClose();
                }
              }}
            >
              <span>Copy text</span>
              <Copy size={17} className="text-content-secondary" />
            </button>
          )}

          {canEdit && onEdit && (
            <button
              type="button"
              disabled={actionBusy}
              className="w-full h-12 px-4 flex items-center justify-between text-[13px] font-semibold text-content-primary hover:bg-elevated active:bg-elevated transition-colors disabled:opacity-50"
              onClick={() => {
                hapticTick();
                onEdit();
              }}
            >
              <span>Edit message</span>
              <Pencil size={17} className="text-primary" />
            </button>
          )}

          {canDelete && onDelete && (
            <button
              type="button"
              disabled={actionBusy}
              className="w-full h-12 px-4 flex items-center justify-between text-[13px] font-semibold text-error hover:bg-error-soft active:bg-error-soft transition-colors disabled:opacity-50"
              onClick={() => {
                hapticWarn();
                onDelete();
              }}
            >
              <span>{deleteLabel}</span>
              <Trash2 size={17} className="text-error" />
            </button>
          )}

          {canReport && onReport && (
            <button
              type="button"
              disabled={actionBusy}
              className="w-full h-12 px-4 flex items-center justify-between text-[13px] font-semibold text-warning hover:bg-elevated active:bg-elevated transition-colors disabled:opacity-50"
              onClick={() => {
                hapticWarn();
                onReport();
              }}
            >
              <span>Report privately</span>
              <AlertTriangle size={17} className="text-warning" />
            </button>
          )}
        </div>

        {/* Admin Moderation Box */}
        {isAdmin && onAdminRemove && (
          <div className="bg-surface border border-error/30 rounded-2xl p-3 flex flex-col gap-2 shadow-sm">
            <label
              htmlFor="chat-action-admin-reason"
              className="text-[10px] font-bold uppercase tracking-wider text-error"
            >
              Moderation removal
            </label>
            <input
              id="chat-action-admin-reason"
              value={adminReason ?? ''}
              maxLength={280}
              onChange={(e) => onAdminReasonChange?.(e.target.value)}
              placeholder="Briefly explain the removal..."
              className="w-full h-9 px-3 rounded-xl bg-base border border-subtle text-xs text-content-primary focus:border-error outline-none"
            />
            <button
              type="button"
              disabled={actionBusy || (adminReason?.trim().length ?? 0) < 3}
              onClick={() => {
                hapticWarn();
                onAdminRemove();
              }}
              className="w-full h-9 rounded-xl bg-error text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <ShieldAlert size={15} />
              <span>Remove as admin</span>
            </button>
          </div>
        )}

        {/* Cancel Button */}
        <button
          type="button"
          disabled={actionBusy}
          onClick={onClose}
          className="w-full h-12 rounded-2xl bg-surface border border-subtle text-xs font-bold text-content-secondary hover:text-content-primary hover:bg-elevated active:scale-[0.99] transition-all shadow-sm"
        >
          Cancel
        </button>
      </div>
    </Overlay>
  );
}
