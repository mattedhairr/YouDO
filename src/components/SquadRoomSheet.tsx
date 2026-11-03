import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Info, Send, Reply, X } from 'lucide-react';
import Overlay from './Overlay';
import SquadSettingsSheet from './SquadSettingsSheet';
import { roomMemberLimit, deleteSquad, getSquadDetails, leaveSquad, type Squad, type SquadMember } from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';
import { hapticSuccess } from '../lib/haptics';
import { fetchSquadMessages, markSquadChatRead, sendSquadMessage, deleteSquadMessage } from '../lib/messages';
import { dismissRoomNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { dispatchPrivateHubSync } from '../lib/privateHubSync';
import { fetchPaceRowsForUserIds } from '../lib/paceCloud';
import { fetchRoomPaceRows, reconcileRoomEvidence } from '../lib/roomFocus';
import { fetchFocusStatuses, subscribeFocusStatuses, type FocusStatus } from '../lib/focusStatus';
import { type PaceRow, type PaceWindow } from '../lib/paceBoard';
import { todayISO } from '../lib/dates';
import SquadProgressBoard from './squad/SquadProgressBoard';
import RoomActivity from './squad/RoomActivity';
import RoomInfoSheet from './squad/RoomInfoSheet';
import UserProfileSheet from './UserProfileSheet';
import { HubAvatar, HubNavBar } from './hub/HubParts';
import { requestOpenDm } from './hub/openDm';
import './chat/youDoChat.css';
import ChatActionSheet from './chat/ChatActionSheet';
import { useChatMessageGestures } from './chat/useChatMessageGestures';

const PACE_WINDOWS: { id: PaceWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function memberPaceRow(userId: string, fallbackBarHours: number, row?: PaceRow): PaceRow {
  if (row) return row;
  return {
    userId,
    displayName: '',
    examLabel: '',
    todayMs: 0,
    weekMs: 0,
    monthMs: 0,
    streak: 0,
    barHours: fallbackBarHours,
    updatedAt: '',
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  squadId: string | null;
  personalPace: number;
}

interface Message {
  id: string;
  sender: string | null | undefined;
  text: string;
  time: string;
  replyToId?: string;
  system?: boolean;
}

const WELCOME: Message = {
  id: 'welcome',
  sender: 'sys',
  text: 'Messages here disappear after 24 hours. Mention someone with @.',
  time: '',
  system: true,
};

/** Rooms opened in this session, so reopening one shows it at once while it refreshes. */
const roomCache = new Map<string, { squad: Squad; members: SquadMember[]; pace: Record<string, PaceRow>; statuses: Record<string, FocusStatus> }>();

export default function SquadRoomSheet({ open, onClose, squadId, personalPace }: Props) {
  const { user } = useAuth();
  const [paceWindow, setPaceWindow] = useState<PaceWindow>('today');
  const [activeTab, setActiveTab] = useState<'board' | 'chat'>('board');
  const [paceByUserId, setPaceByUserId] = useState<Record<string, PaceRow>>({});
  const [statuses, setStatuses] = useState<Record<string, FocusStatus>>({});
  const [message, setMessage] = useState('');

  const [squad, setSquad] = useState<Squad | null>(null);
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSquad = useCallback(async () => {
    if (!squadId) return;
    const res = await getSquadDetails(squadId);
    if (res) {
      setSquad(res.squad);
      setMembers(res.members);
      // Show the room now; focus totals fill in when they arrive.
      setLoading(false);
      const accepted = res.members.filter((m) => m.status === 'accepted');
      const ids = accepted.map((m) => m.user_id);
      const names = Object.fromEntries(accepted.map((m) => [m.user_id, m.profiles?.display_name ?? '']));
      const [roomRows, focus] = await Promise.all([fetchRoomPaceRows(squadId, names), fetchFocusStatuses(ids)]);
      let map: Record<string, PaceRow> = roomRows ?? {};
      if (roomRows === null) {
        // Server without room focus yet: fall back to Public Board totals.
        map = {};
        for (const row of await fetchPaceRowsForUserIds(ids)) map[row.userId] = row;
      }
      setPaceByUserId(map);
      setStatuses(focus);
      roomCache.set(squadId, { squad: res.squad, members: res.members, pace: map, statuses: focus });
    } else {
      setSquad(null);
    }
    setLoading(false);
  }, [squadId]);

  useEffect(() => {
    if (!open || !squadId) return;
    const cached = roomCache.get(squadId);
    if (cached) {
      setSquad(cached.squad);
      setMembers(cached.members);
      setPaceByUserId(cached.pace);
      setStatuses(cached.statuses);
    }
    setLoading(!cached);
    setActiveTab('board');
    void fetchSquad();
    // Bring your own room copy up to date with your latest synced backup.
    void reconcileRoomEvidence().then((result) => {
      if (result.ok && result.status === 'current') void fetchSquad();
    });
  }, [open, squadId, fetchSquad]);

  // Synced focus totals refresh while the board is open.
  useEffect(() => {
    if (!open || !squadId || activeTab !== 'board') return;
    const id = window.setInterval(() => void fetchSquad(), 45_000);
    return () => window.clearInterval(id);
  }, [open, squadId, activeTab, fetchSquad]);

  const acceptedIds = useMemo(
    () => members.filter((m) => m.status === 'accepted').map((m) => m.user_id).sort(),
    [members],
  );
  const acceptedKey = acceptedIds.join(',');

  // Live focus: room-mates' start / pause / stop arrive as they happen.
  useEffect(() => {
    if (!open || !acceptedIds.length) return;
    return subscribeFocusStatuses(acceptedIds, (status) => {
      setStatuses((current) => ({ ...current, [status.userId]: status }));
    });
    // acceptedKey stands for acceptedIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, acceptedKey]);

  const [messages, setMessages] = useState<Message[]>([WELCOME]);

  useEffect(() => {
    if (!open || !squadId) return;

    const loadMessages = async (markRead: boolean) => {
      const data = await fetchSquadMessages(squadId);
      setMessages([
        WELCOME,
        ...data.map((d) => ({
          id: d.id,
          sender: d.sender_id,
          text: d.content,
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          replyToId: d.reply_to_id || undefined,
        })),
      ]);
      if (markRead && user) {
        const latest = data[data.length - 1];
        markSquadChatRead(user.id, squadId, latest?.created_at ?? new Date().toISOString());
        void dismissRoomNotification(squadId);
        dispatchPrivateHubSync('squads');
      }
    };

    void loadMessages(activeTab === 'chat');

    const channel = supabase
      .channel('squad_' + squadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_messages', filter: 'squad_id=eq.' + squadId }, () => {
        void loadMessages(activeTab === 'chat');
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, squadId, activeTab, user]);

  const openActions = useCallback((msg: Message) => {
    if (msg.system) return;
    setSelectedMessage(msg);
  }, []);

  const handleReply = useCallback((msg: Message) => {
    if (msg.system) return;
    setReplyingTo(msg);
    setSelectedMessage(null);
    inputRef.current?.focus();
  }, []);

  const { getMessageProps } = useChatMessageGestures<Message>({
    onOpenActions: openActions,
    onDoubleTapReply: handleReply,
  });

  if (!open || !squadId) return null;

  const barHours = squad?.bar_hours || 4;
  const anchorISO = todayISO();
  const acceptedMembers = members.filter((m) => m.status === 'accepted');
  const myMembership = members.find((m) => m.user_id === user?.id);
  const canManage = Boolean(squad && user && (squad.created_by === user.id || (myMembership?.role === 'admin' && myMembership.status === 'accepted')));
  const selfSharing = Boolean(user && paceByUserId[user.id]);

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);
    const words = val.split(' ');
    setShowMentions(words[words.length - 1].startsWith('@'));
  };

  // The @ list narrows to the letters typed after @, by name or username.
  const mentionQuery = showMentions ? (message.split(' ').pop() ?? '').slice(1).toLowerCase() : '';
  const mentionMembers = acceptedMembers.filter((m) => {
    const username = m.profiles?.username;
    if (m.user_id === user?.id || !username) return false;
    const name = (m.profiles?.display_name ?? '').toLowerCase();
    return username.toLowerCase().startsWith(mentionQuery) || name.split(/\s+/).some((part) => part.startsWith(mentionQuery));
  });
  const mentionEveryone = 'all'.startsWith(mentionQuery) || 'everyone'.startsWith(mentionQuery);

  const insertMention = (username: string) => {
    const words = message.split(' ');
    words.pop();
    words.push(`@${username} `);
    setMessage(words.join(' '));
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!message.trim() || !user || !squadId) return;
    hapticSuccess();
    const content = message.trim();
    const replyId = replyingTo?.id;
    setMessage('');
    setReplyingTo(null);
    setShowMentions(false);
    const tempId = Date.now().toString();
    setMessages((prev) => [...prev, { id: tempId, sender: user.id, text: content, time: 'Sending…', replyToId: replyId }]);
    await sendSquadMessage(squadId, user.id, content, replyId);
  };

  const deleteMessage = async (id: string) => {
    setSelectedMessage(null);
    if (!user) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await deleteSquadMessage(id, user.id);
  };

  const getAuthorName = (uid?: string | null) => {
    if (uid === user?.id) return 'You';
    const m = members.find((x) => x.user_id === uid);
    return m?.profiles?.display_name || 'Member';
  };

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="hub hub-page">
        {loading ? (
          <>
            <HubNavBar title="Room" onBack={onClose} />
            <div className="flex flex-1 items-center justify-center text-[15px] text-content-muted" role="status">Loading room…</div>
          </>
        ) : !squad ? (
          <>
            <HubNavBar title="Room" onBack={onClose} />
            <div className="hub-empty flex-1 justify-center">
              <p className="hub-empty-title">This room is gone</p>
              <p className="hub-empty-text">It was deleted, or you are no longer a member.</p>
            </div>
          </>
        ) : (
          <>
            <HubNavBar
              title={`${squad.description || '🔥'} ${squad.name}`}
              subtitle={`${acceptedMembers.length} of ${roomMemberLimit(squad)} members${squad.bar_hours ? ` · ${squad.bar_hours}h a day` : ''}`}
              onBack={onClose}
              backLabel="Back to rooms"
              actions={
                <button type="button" className="hub-icon-button" onClick={() => setInfoOpen(true)} aria-label="Room info">
                  <Info size={18} strokeWidth={2.2} />
                </button>
              }
            />

            <div className="hub-page-tabs">
              <div className="hub-segmented" role="tablist" aria-label="Room">
                <button type="button" role="tab" aria-selected={activeTab === 'board'} onClick={() => setActiveTab('board')}>Progress</button>
                <button type="button" role="tab" aria-selected={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>Chat</button>
              </div>
            </div>

            {activeTab === 'board' ? (
              <div className="hub-page-body">
                <div className="hub-segmented mb-4" role="tablist" aria-label="Period">
                  {PACE_WINDOWS.map((tab) => (
                    <button key={tab.id} type="button" role="tab" aria-selected={paceWindow === tab.id} onClick={() => setPaceWindow(tab.id)}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {!selfSharing && (
                  <div className="hub-banner" role="note">
                    <Info size={16} className="mt-px shrink-0 text-primary" />
                    <span>
                      Your focus shows here after your next cloud sync. Rooms count it whether or not you joined the Public Board.
                    </span>
                  </div>
                )}

                <SquadProgressBoard
                  members={acceptedMembers}
                  paceByUserId={paceByUserId}
                  squadBarHours={barHours}
                  paceWindow={paceWindow}
                  anchorISO={anchorISO}
                  currentUserId={user?.id}
                  viewerBarHours={personalPace}
                  emptyPaceRow={(userId) => memberPaceRow(userId, userId === user?.id ? personalPace : 0, paceByUserId[userId])}
                  onOpenProfile={(uid) => setSelectedProfileUserId(uid)}
                />

                <div className="mt-6">
                  <RoomActivity
                    members={acceptedMembers.map((m) => {
                      const row = paceByUserId[m.user_id];
                      const isSelf = m.user_id === user?.id;
                      const ownBar = isSelf && personalPace > 0 ? personalPace : Number(row?.barHours ?? 0);
                      return {
                        userId: m.user_id,
                        name: m.profiles?.display_name || 'Member',
                        avatarUrl: m.profiles?.avatar_url,
                        isSelf,
                        barHours: ownBar > 0 ? ownBar : barHours,
                      };
                    })}
                    statuses={statuses}
                    paceByUserId={paceByUserId}
                    anchorISO={anchorISO}
                    onOpenProfile={(uid) => setSelectedProfileUserId(uid)}
                  />
                </div>
              </div>
            ) : (
              <div className="yd-chat flex-1 min-h-0 relative">
                <div className="yd-chat-scroll">
                  <ol className="yd-chat-list">
                    {messages.map((msg) => {
                      if (msg.system) {
                        return (
                          <li key={msg.id} className="yd-chat-system">
                            <span>{msg.text}</span>
                          </li>
                        );
                      }

                      const isMe = msg.sender === user?.id;
                      const repliedTo = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : null;
                      const authorName = getAuthorName(msg.sender);
                      const renderText = (txt: string) =>
                        txt.split(' ').map((word, i) =>
                          word.startsWith('@') ? <strong key={i} className="yd-chat-mention">{word} </strong> : word + ' ',
                        );

                      return (
                        <li key={msg.id} className={`yd-chat-row ${isMe ? 'is-mine' : ''}`}>
                          <div className="yd-chat-bubble-wrap">
                            <div className="yd-chat-cluster">
                              <div className="yd-chat-clip" data-yd-chat-anchor={msg.id}>
                                <article className="yd-chat-bubble" tabIndex={0} aria-label={`${authorName}: ${msg.text}`} {...getMessageProps(msg)}>
                                  {!isMe && (
                                    <div className="yd-chat-author">
                                      <button type="button" className="text-left" onClick={() => msg.sender && setSelectedProfileUserId(msg.sender)}>
                                        {authorName}
                                      </button>
                                    </div>
                                  )}
                                  {msg.replyToId && repliedTo && (
                                    <blockquote className="yd-chat-quote">
                                      <strong>{getAuthorName(repliedTo.sender)}</strong>
                                      <span>{repliedTo.text || 'Message unavailable'}</span>
                                    </blockquote>
                                  )}
                                  <p className="yd-chat-body">{renderText(msg.text)}</p>
                                </article>
                              </div>
                              <div className="yd-chat-meta">
                                <time>{msg.time}</time>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <footer className="yd-chat-composer relative">
                  {/* The @ list opens just above the message box. */}
                  {showMentions && (mentionEveryone || mentionMembers.length > 0) && (
                    <div className="hub-group absolute bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto shadow-xl">
                      {mentionEveryone && (
                        <button type="button" onClick={() => insertMention('all')} className="hub-row is-compact">
                          <span className="hub-avatar is-sm">@</span>
                          <span className="hub-row-main">
                            <span className="hub-row-title text-[15px]">Everyone</span>
                            <span className="hub-row-subtitle block">Mention all room members</span>
                          </span>
                        </button>
                      )}
                      {mentionMembers.map((m) => (
                        <button key={m.user_id} type="button" onClick={() => insertMention(m.profiles!.username)} className="hub-row is-compact">
                          <HubAvatar url={m.profiles?.avatar_url} name={m.profiles?.display_name} size="sm" />
                          <span className="hub-row-main">
                            <span className="hub-row-title text-[15px]"><span className="hub-truncate">{m.profiles?.display_name}</span></span>
                            <span className="hub-row-subtitle block">@{m.profiles?.username}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {replyingTo && (
                    <div className="yd-chat-reply">
                      <Reply size={16} className="shrink-0 text-secondary" />
                      <span className="yd-chat-reply-text">
                        <strong>Replying to {getAuthorName(replyingTo.sender)}</strong>
                        {replyingTo.text}
                      </span>
                      <button type="button" className="yd-chat-reply-dismiss" aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>
                        <X size={18} />
                      </button>
                    </div>
                  )}
                  <div className="yd-chat-compose-row">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Message the room…"
                      value={message}
                      onChange={handleMessageChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSend();
                      }}
                    />
                    <button type="button" className="yd-chat-send" disabled={!message.trim()} onClick={() => void handleSend()} aria-label="Send message">
                      <Send size={19} />
                    </button>
                  </div>
                  <p className="yd-chat-hint">
                    <span>Hold for options · double-tap to reply</span>
                  </p>
                </footer>

                <ChatActionSheet
                  open={!!selectedMessage}
                  onClose={() => setSelectedMessage(null)}
                  authorName={selectedMessage ? getAuthorName(selectedMessage.sender) : ''}
                  time={selectedMessage?.time ?? ''}
                  body={selectedMessage?.text ?? ''}
                  canReply={!selectedMessage?.system}
                  onReply={() => selectedMessage && handleReply(selectedMessage)}
                  canCopy={true}
                  canDelete={selectedMessage?.sender === user?.id}
                  deleteLabel="Delete message"
                  onDelete={() => selectedMessage && void deleteMessage(selectedMessage.id)}
                />
              </div>
            )}

            <RoomInfoSheet
              open={infoOpen}
              onClose={() => setInfoOpen(false)}
              squad={squad}
              members={members}
              currentUserId={user?.id}
              canManage={canManage}
              onOpenSettings={() => {
                setInfoOpen(false);
                setSettingsOpen(true);
              }}
              onOpenProfile={(uid) => setSelectedProfileUserId(uid)}
              onLeave={async () => {
                if (!user) return false;
                const ok = await leaveSquad(squad.id, user.id);
                if (ok) {
                  setInfoOpen(false);
                  onClose();
                }
                return ok;
              }}
              onDelete={async () => {
                const result = await deleteSquad(squad.id);
                if (result.ok) {
                  setInfoOpen(false);
                  onClose();
                }
                return result.ok;
              }}
            />

            {settingsOpen && (
              <SquadSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} squad={squad} members={members} onMembersChanged={fetchSquad} />
            )}

            {selectedProfileUserId && (
              <UserProfileSheet
                open={Boolean(selectedProfileUserId)}
                userId={selectedProfileUserId}
                onClose={() => setSelectedProfileUserId(null)}
                onFriendshipChange={() => void fetchSquad()}
                onMessage={() => {
                  const target = selectedProfileUserId;
                  setSelectedProfileUserId(null);
                  onClose();
                  requestOpenDm(target);
                }}
              />
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}
