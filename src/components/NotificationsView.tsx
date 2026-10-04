import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Check, DoorOpen, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  fetchPendingRequests,
  fetchOutgoingFriendRequests,
  type FriendRequest,
  type OutgoingFriendRequest,
} from '../lib/profiles';
import {
  acceptSquadInvite,
  rejectSquadInvite,
  fetchPendingSquadInvites,
  fetchOutgoingSquadJoinRequests,
  fetchIncomingSquadJoinRequests,
  acceptSquadJoinRequest,
  declineSquadJoinRequest,
  cancelOutgoingSquadJoinRequest,
  type IncomingSquadJoinRequest,
  type PendingSquadInvite,
  type Squad,
} from '../lib/squads';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { PRIVATE_HUB_SYNC_EVENT } from '../lib/privateHubSync';

type Screen = 'home' | 'pending';
type PendingTab = 'received' | 'sent';

interface Props {
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onChanged?: () => void;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function NotificationsView({ onClose, onOpenProfile, onChanged }: Props) {
  const { user } = useAuth();
  const [screen, setScreen] = useState<Screen>('home');
  const [pendingTab, setPendingTab] = useState<PendingTab>('received');
  const [loading, setLoading] = useState(true);

  const [friendIn, setFriendIn] = useState<FriendRequest[]>([]);
  const [friendOut, setFriendOut] = useState<OutgoingFriendRequest[]>([]);
  const [squadInvites, setSquadInvites] = useState<PendingSquadInvite[]>([]);
  const [squadJoinIn, setSquadJoinIn] = useState<IncomingSquadJoinRequest[]>([]);
  const [squadJoinOut, setSquadJoinOut] = useState<Squad[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [friends, outgoingFriends, squads, incoming, outgoing] = await Promise.all([
      fetchPendingRequests(user.id),
      fetchOutgoingFriendRequests(user.id),
      fetchPendingSquadInvites(user.id),
      fetchIncomingSquadJoinRequests(user.id),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setFriendIn(friends);
    setFriendOut(outgoingFriends);
    setSquadInvites(squads);
    setSquadJoinIn(incoming);
    setSquadJoinOut(outgoing);
    setLoading(false);
    onChanged?.();
  }, [user, onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onSync = () => {
      void reload();
    };
    window.addEventListener(PRIVATE_HUB_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, onSync);
  }, [reload]);

  const receivedCount = friendIn.length + squadInvites.length + squadJoinIn.length;
  const sentCount = friendOut.length + squadJoinOut.length;
  const pendingTotal = receivedCount + sentCount;

  const header = (title: string, back?: () => void) => (
    <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center px-2 py-1.5 border-b border-subtle mb-1">
      <button
        type="button"
        onClick={(e) => {
          if (back) back();
          else onClose();
          e.currentTarget.blur();
        }}
        className="flex items-center justify-center size-11 rounded-full text-content-primary transition-colors [-webkit-tap-highlight-color:transparent] active:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={back ? 'Back' : 'Close notifications'}
      >
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-[17px] font-bold text-content-primary text-center truncate px-1">{title}</h1>
      <div aria-hidden className="size-11" />
    </div>
  );

  if (screen === 'home') {
    return (
      <div className="flex flex-col min-h-[70vh] animate-in fade-in duration-200">
        {header('Notifications')}

        <div className="px-1 pt-2">
          <button
            type="button"
            onClick={() => setScreen('pending')}
            className="w-full flex items-center gap-3 p-4 rounded-[18px] bg-elevated border border-subtle hover:border-primary/30 active:scale-[0.99] transition-all text-left"
          >
            <div className="w-11 h-11 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <UserPlus size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-content-primary">Pending requests</p>
              <p className="text-[12px] text-content-secondary mt-0.5">
                {pendingTotal === 0
                  ? 'No open requests'
                  : receivedCount > 0
                    ? `${receivedCount} need your response`
                    : `${sentCount} waiting on others`}
              </p>
            </div>
            {pendingTotal > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-error text-[11px] font-bold text-white flex items-center justify-center">
                {pendingTotal > 9 ? '9+' : pendingTotal}
              </span>
            )}
            <ChevronRight size={18} className="text-content-muted shrink-0" />
          </button>

          <p className="text-[11px] text-content-muted px-2 mt-6 leading-relaxed">
            Friend requests, squad invites, and room join requests live here. Tap Pending requests to review sent and
            received.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[70vh] animate-in fade-in duration-200">
      {header('Pending requests', () => setScreen('home'))}

      <div className="px-1 mb-4">
        <div className="flex rounded-[12px] border border-subtle bg-elevated p-1">
          {(['received', 'sent'] as PendingTab[]).map((tab) => {
            const active = pendingTab === tab;
            const count = tab === 'received' ? receivedCount : sentCount;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setPendingTab(tab)}
                className={`flex-1 h-9 rounded-[10px] text-[12px] font-bold capitalize transition-colors ${
                  active ? 'bg-primary text-on-primary' : 'text-content-muted'
                }`}
              >
                {tab}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${active ? 'opacity-90' : 'text-content-muted'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-6 space-y-5">
        {loading ? (
          <p className="text-center text-[12px] text-content-muted py-10">Loading…</p>
        ) : pendingTab === 'received' ? (
          receivedCount === 0 ? (
            <EmptyState message="Nothing waiting on you. Requests others send will show up here." />
          ) : (
            <>
              {squadJoinIn.length > 0 && (
                <Section title="Squad join requests">
                  {squadJoinIn.map((req) => (
                    <div key={`${req.squad_id}-${req.user_id}`} className="flex gap-3 py-3 border-b border-subtle/80 last:border-0">
                      <button type="button" onClick={() => req.requester && onOpenProfile(req.requester.id)} className="shrink-0">
                        <div className="w-12 h-12 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center text-lg">
                          {req.requester ? (
                            <ProfileAvatarVisual
                              avatarUrl={req.requester.avatar_url}
                              displayName={req.requester.display_name}
                              className="leading-none"
                              imgClassName="w-full h-full object-cover"
                            />
                          ) : (
                            '🎓'
                          )}
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-snug text-content-primary">
                          <span className="font-bold">{req.requester?.display_name ?? 'Someone'}</span>
                          {' '}wants to join{' '}
                          <span className="font-bold">{req.squad.name}</span>
                        </p>
                        <p className="text-[10px] text-content-muted mt-1">{timeAgo(req.joined_at)}</p>
                        <div className="flex gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => void acceptSquadJoinRequest(req.squad_id, req.user_id).then(() => reload())}
                            className="flex-1 h-9 rounded-[10px] bg-primary text-on-primary text-[12px] font-bold"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => void declineSquadJoinRequest(req.squad_id, req.user_id).then(() => reload())}
                            className="flex-1 h-9 rounded-[10px] border border-subtle text-[12px] font-semibold text-content-secondary"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {friendIn.length > 0 && (
                <Section title="Friend requests">
                  {friendIn.map((req) => (
                    <div key={req.id} className="flex gap-3 py-3 border-b border-subtle/80 last:border-0">
                      <button type="button" onClick={() => onOpenProfile(req.requester.id)} className="shrink-0">
                        <div className="w-12 h-12 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center text-lg">
                          <ProfileAvatarVisual
                            avatarUrl={req.requester.avatar_url}
                            displayName={req.requester.display_name}
                            className="leading-none"
                            imgClassName="w-full h-full object-cover"
                          />
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-content-primary">
                          <span className="font-bold">{req.requester.display_name}</span>
                          <span className="text-content-secondary"> · @{req.requester.username}</span>
                        </p>
                        {req.request_message && (
                          <p className="text-[11px] text-content-secondary mt-1 line-clamp-2">“{req.request_message}”</p>
                        )}
                        <p className="text-[10px] text-content-muted mt-1">{timeAgo(req.created_at)}</p>
                        <div className="flex gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => void acceptFriendRequest(req.id).then(() => reload())}
                            className="flex-1 h-9 rounded-[10px] bg-primary text-on-primary text-[12px] font-bold"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => void rejectFriendRequest(req.id).then(() => reload())}
                            className="flex-1 h-9 rounded-[10px] border border-subtle text-[12px] font-semibold text-content-secondary"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {squadInvites.length > 0 && (
                <Section title="Squad invites">
                  {squadInvites.map((invite) => {
                    const squad = invite.squads;
                    if (!squad) return null;
                    return (
                      <div key={invite.squad_id} className="flex gap-3 py-3 border-b border-subtle/80 last:border-0">
                        <div className="w-12 h-12 rounded-full bg-surface border border-subtle flex items-center justify-center text-xl shrink-0">
                          {squad.description || '🔥'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-content-primary">
                            Invite to <span className="font-bold">{squad.name}</span>
                          </p>
                          <p className="text-[11px] text-primary mt-0.5">🎯 {squad.bar_hours}h/day</p>
                          <div className="flex gap-2 mt-2.5">
                            <button
                              type="button"
                              onClick={() => user && void acceptSquadInvite(invite.squad_id, user.id).then(() => reload())}
                              className="flex-1 h-9 rounded-[10px] bg-primary text-on-primary text-[12px] font-bold"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => user && void rejectSquadInvite(invite.squad_id, user.id).then(() => reload())}
                              className="flex-1 h-9 rounded-[10px] border border-subtle text-[12px] font-semibold"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Section>
              )}
            </>
          )
        ) : sentCount === 0 ? (
          <EmptyState message="You haven’t sent any requests yet. Join a squad from Rooms or add a friend from DMs." />
        ) : (
          <>
            {squadJoinOut.length > 0 && (
              <Section title="Squad join requests">
                {squadJoinOut.map((squad) => (
                  <div key={squad.id} className="flex gap-3 py-3 border-b border-subtle/80 last:border-0 items-center">
                    <div className="w-12 h-12 rounded-full bg-surface border border-subtle flex items-center justify-center text-xl shrink-0">
                      {squad.description || '🔥'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-content-primary truncate">{squad.name}</p>
                      <p className="text-[11px] text-secondary font-medium flex items-center gap-1 mt-0.5">
                        <DoorOpen size={12} /> Request sent · waiting on admin
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        user && void cancelOutgoingSquadJoinRequest(squad.id, user.id).then(() => reload())
                      }
                      className="text-[11px] font-semibold text-content-muted px-2 py-1 rounded-lg border border-subtle"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </Section>
            )}

            {friendOut.length > 0 && (
              <Section title="Friend requests">
                {friendOut.map((req) => (
                  <div key={req.id} className="flex gap-3 py-3 border-b border-subtle/80 last:border-0 items-center">
                    <button type="button" onClick={() => onOpenProfile(req.receiver.id)} className="shrink-0">
                      <div className="w-12 h-12 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center text-lg">
                        <ProfileAvatarVisual
                          avatarUrl={req.receiver.avatar_url}
                          displayName={req.receiver.display_name}
                          className="leading-none"
                          imgClassName="w-full h-full object-cover"
                        />
                      </div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-content-primary">
                        Request sent to <span className="font-bold">{req.receiver.display_name}</span>
                      </p>
                      <p className="text-[10px] text-content-muted mt-1">{timeAgo(req.created_at)}</p>
                    </div>
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-wide">Pending</span>
                  </div>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-content-muted mb-1 px-1">{title}</h2>
      <div className="rounded-[16px] border border-subtle bg-elevated/60 px-3">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-elevated border border-subtle flex items-center justify-center mx-auto mb-3 text-content-muted">
        <Check size={22} />
      </div>
      <p className="text-[13px] font-semibold text-content-primary">You&apos;re all caught up</p>
      <p className="text-[11px] text-content-muted mt-2 leading-relaxed max-w-[260px] mx-auto">{message}</p>
    </div>
  );
}
