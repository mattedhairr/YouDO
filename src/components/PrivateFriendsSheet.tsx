import { ChevronLeft, MessageCircle } from 'lucide-react';
import Overlay from './Overlay';
import { profileDisplayLabel, type Profile } from '../lib/profiles';
import { ProfileAvatarVisual } from '../lib/profileAvatar';

interface Props {
  open: boolean;
  friends: Profile[];
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onMessage: (friend: Profile) => void;
}

export default function PrivateFriendsSheet({
  open,
  friends,
  onClose,
  onOpenProfile,
  onMessage,
}: Props) {
  if (!open) return null;

  const sorted = [...friends].sort((a, b) =>
    profileDisplayLabel(a).localeCompare(profileDisplayLabel(b)),
  );

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="flex flex-col h-full max-h-[min(92dvh,640px)] bg-surface rounded-t-[20px] border border-subtle">
        <header className="flex items-center gap-2 px-3 py-3 border-b border-subtle shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 grid place-items-center rounded-[10px] text-content-secondary hover:bg-elevated"
            aria-label="Close"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold text-content-primary">Friends</h2>
            <p className="text-[11px] text-content-muted tabular-nums">{friends.length} total</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {sorted.length === 0 ? (
            <p className="text-center text-[13px] text-content-muted py-12 px-6">No friends yet.</p>
          ) : (
            <ul className="divide-y divide-subtle">
              {sorted.map((friend) => {
                const title = profileDisplayLabel(friend);
                return (
                  <li key={friend.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(friend.id)}
                      className="shrink-0 w-11 h-11 rounded-full overflow-hidden bg-primary-soft text-primary font-bold ring-1 ring-border-subtle flex items-center justify-center"
                      aria-label={`${title} profile`}
                    >
                      <ProfileAvatarVisual
                        avatarUrl={friend.avatar_url}
                        displayName={title}
                        className="text-sm font-bold"
                        imgClassName="w-full h-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProfile(friend.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-[14px] font-semibold text-content-primary truncate">{title}</p>
                      <p className="text-[11px] text-content-muted truncate">@{friend.username}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMessage(friend)}
                      className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-primary-soft text-primary hover:bg-primary hover:text-on-primary transition-colors"
                      aria-label={`Message ${title}`}
                    >
                      <MessageCircle size={17} strokeWidth={2.2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Overlay>
  );
}
