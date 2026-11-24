import { useState } from 'react';
import { MessageCircle, Search, Users } from 'lucide-react';
import Overlay from './Overlay';
import { profileDisplayLabel, type Profile } from '../lib/profiles';
import { HubAvatar, HubEmpty, HubNavBar } from './hub/HubParts';

interface Props {
  open: boolean;
  friends: Profile[];
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onMessage: (friend: Profile) => void;
}

export default function PrivateFriendsSheet({ open, friends, onClose, onOpenProfile, onMessage }: Props) {
  const [filter, setFilter] = useState('');
  if (!open) return null;

  const needle = filter.trim().toLowerCase().replace(/^@/, '');
  const sorted = [...friends]
    .sort((a, b) => profileDisplayLabel(a).localeCompare(profileDisplayLabel(b)))
    .filter((f) => !needle || profileDisplayLabel(f).toLowerCase().includes(needle) || f.username.toLowerCase().includes(needle));

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="hub hub-page">
        <HubNavBar title="Friends" subtitle={`${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`} onBack={onClose} />
        <div className="hub-page-body">
          {friends.length > 6 && (
            <div className="hub-search mb-4">
              <Search size={16} aria-hidden />
              <input value={filter} placeholder="Search friends" aria-label="Search friends" onChange={(e) => setFilter(e.target.value)} />
            </div>
          )}
          <div className="hub-group">
            {friends.length === 0 ? (
              <HubEmpty icon={<Users size={24} />} title="No friends yet" text="Add friends by their @username from the Chats tab." />
            ) : sorted.length === 0 ? (
              <p className="hub-row is-compact justify-center text-[15px] text-content-muted">No friend matches “{filter}”.</p>
            ) : (
              sorted.map((friend) => {
                const title = profileDisplayLabel(friend);
                return (
                  <div key={friend.id} className="hub-row">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpenProfile(friend.id)} aria-label={`${title} profile`}>
                      <HubAvatar url={friend.avatar_url} name={title} backer={friend.is_backer === true} />
                      <span className="hub-row-main">
                        <span className="hub-row-title"><span className="hub-truncate">{title}</span></span>
                        <span className="hub-row-subtitle hub-truncate block">@{friend.username}</span>
                      </span>
                    </button>
                    <button type="button" className="hub-icon-button" onClick={() => onMessage(friend)} aria-label={`Message ${title}`}>
                      <MessageCircle size={17} strokeWidth={2.2} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
