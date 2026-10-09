import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Settings, Send, Reply, X } from 'lucide-react';
import Overlay from './Overlay';
import SquadSettingsSheet from './SquadSettingsSheet';
import { getSquadDetails, type Squad, type SquadMember } from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';
import { hapticSuccess } from '../lib/haptics';
import { fetchSquadMessages, markSquadChatRead, sendSquadMessage, deleteSquadMessage } from '../lib/messages';
import { dismissRoomNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { dispatchPrivateHubSync } from '../lib/privateHubSync';
import { fetchPaceRowsForUserIds } from '../lib/paceCloud';
import {
  type PaceRow,
  type PaceWindow,
  paceWindowBarDays,
  windowMs,
} from '../lib/paceBoard';
import { todayISO } from '../lib/dates';
import SquadProgressBoard from './squad/SquadProgressBoard';
import UserProfileSheet from './UserProfileSheet';
import './chat/youDoChat.css';
import ChatActionSheet from './chat/ChatActionSheet';
import { useChatMessageGestures } from './chat/useChatMessageGestures';

const PACE_WINDOWS: { id: PaceWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function squadWindowLabel(paceWindow: PaceWindow): string {
  if (paceWindow === 'week') return 'Focus since Monday · 7-day bar';
  if (paceWindow === 'month') return `Focus since the 1st · ${paceWindowBarDays('month')}-day bar`;
  return 'Today';
}

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

export default function SquadRoomSheet({ open, onClose, squadId, personalPace }: Props) {
  const { user } = useAuth();
  const [paceWindow, setPaceWindow] = useState<PaceWindow>('today');
  const [activeTab, setActiveTab] = useState<'board' | 'chat'>('board');
  const [paceByUserId, setPaceByUserId] = useState<Record<string, PaceRow>>({});
  const [message, setMessage] = useState('');
  
  const [squad, setSquad] = useState<Squad | null>(null);
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  // Advanced Chat State
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSquad = useCallback(async () => {
    if (!squadId) return;
    setLoading(true);
    const res = await getSquadDetails(squadId);
    if (res) {
      setSquad(res.squad);
      setMembers(res.members);
      const ids = res.members.map((m) => m.user_id);
      const paceRows = await fetchPaceRowsForUserIds(ids);
      const map: Record<string, PaceRow> = {};
      for (const row of paceRows) map[row.userId] = row;
      setPaceByUserId(map);
    }
    setLoading(false);
  }, [squadId]);

  useEffect(() => {
    if (open && squadId) void fetchSquad();
  }, [open, squadId, fetchSquad]);

  useEffect(() => {
    if (!open || !squadId || activeTab !== 'board') return;
    const id = window.setInterval(() => {
      void fetchSquad();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [open, squadId, activeTab, fetchSquad]);

  // Mock chat history
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'sys', text: 'Welcome to the room. Progress uses each member’s synced daily bar.', time: '9:00 AM', system: true }
  ]);
  
  useEffect(() => {
    if (!open || !squadId) return;

    const loadMessages = async (markRead: boolean) => {
      const data = await fetchSquadMessages(squadId);
      setMessages([
        { id: '1', sender: 'sys', text: 'Welcome to the room. Progress uses each member’s synced daily bar.', time: '9:00 AM', system: true },
        ...data.map(d => ({
          id: d.id,
          sender: d.sender_id,
          text: d.content,
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          replyToId: d.reply_to_id || undefined
        }))
      ]);
      if (markRead && user) {
        const latest = data[data.length - 1];
        markSquadChatRead(user.id, squadId, latest?.created_at ?? new Date().toISOString());
        void dismissRoomNotification(squadId);
        dispatchPrivateHubSync('squads');
      }
    };

    void loadMessages(activeTab === 'chat');

    const channel = supabase.channel('squad_' + squadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_messages', filter: 'squad_id=eq.' + squadId }, () => {
         void loadMessages(activeTab === 'chat');
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
  const acceptedMembers = members
    .filter((m) => m.status === 'accepted')
    .sort((a, b) => {
      const fallbackA = a.user_id === user?.id ? personalPace : 0;
      const fallbackB = b.user_id === user?.id ? personalPace : 0;
      const rowA = memberPaceRow(a.user_id, fallbackA, paceByUserId[a.user_id]);
      const rowB = memberPaceRow(b.user_id, fallbackB, paceByUserId[b.user_id]);
      return windowMs(rowB, paceWindow, anchorISO) - windowMs(rowA, paceWindow, anchorISO);
    });

  // Input Handler for Mentions
  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);
    
    // Check if the last word starts with @
    const words = val.split(' ');
    const lastWord = words[words.length - 1];
    if (lastWord.startsWith('@')) {
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (username: string) => {
    const words = message.split(' ');
    words.pop(); // remove the partial @
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
    
    // optimistic UI
    const tempId = Date.now().toString();
    setMessages(prev => [...prev, { id: tempId, sender: user.id, text: content, time: 'Sending...', replyToId: replyId }]);
    
    await sendSquadMessage(squadId, user.id, content, replyId);
  };

  const deleteMessage = async (id: string) => {
    setSelectedMessage(null);
    if (!user) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    await deleteSquadMessage(id, user.id);
  };

  // Helper to get author name
  const getAuthorName = (uid?: string | null) => {
    if (uid === user?.id) return 'You';
    const m = members.find(x => x.user_id === uid);
    return m?.profiles?.display_name || 'Member';
  };

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto flex flex-col h-full">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-muted">Loading room...</div>
        ) : !squad ? (
          <div className="flex-1 flex items-center justify-center text-error">Room not found</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-subtle">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-1 -ml-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
                  <ChevronLeft size={24} />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{squad.description || '🔥'}</span>
                  <h2 className="text-[15px] font-bold text-content-primary max-w-[140px] truncate">{squad.name}</h2>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-primary bg-primary-soft border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                  🎯 {squad.bar_hours}h
                </span>
                {user?.id === squad.created_by && (
                  <button onClick={() => setSettingsOpen(true)} className="p-1.5 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
                    <Settings size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-subtle">
              <button
                onClick={() => setActiveTab('board')}
                className={`flex-1 py-3 text-[13px] font-bold transition-colors relative ${activeTab === 'board' ? 'text-primary' : 'text-content-muted'}`}
              >
                Progress
                {activeTab === 'board' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-[13px] font-bold transition-colors relative ${activeTab === 'chat' ? 'text-primary' : 'text-content-muted'}`}
              >
                Room Chat
                {activeTab === 'chat' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </button>
            </div>

            {/* Content */}
            {activeTab === 'board' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
                <div className="flex gap-1 rounded-[12px] border border-subtle bg-elevated p-1">
                  {PACE_WINDOWS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPaceWindow(tab.id)}
                      className={`flex-1 h-9 rounded-[10px] text-[12px] font-semibold transition-colors ${
                        paceWindow === tab.id ? 'bg-primary-soft text-primary' : 'text-content-muted'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] text-content-muted px-0.5">{squadWindowLabel(paceWindow)}, local time</p>

                <SquadProgressBoard
                  members={acceptedMembers}
                  paceByUserId={paceByUserId}
                  squadBarHours={barHours}
                  paceWindow={paceWindow}
                  anchorISO={anchorISO}
                  currentUserId={user?.id}
                  viewerBarHours={personalPace}
                  emptyPaceRow={(userId) =>
                    memberPaceRow(
                      userId,
                      userId === user?.id ? personalPace : 0,
                      paceByUserId[userId],
                    )
                  }
                  onOpenProfile={(uid) => setSelectedProfileUserId(uid)}
                />
              </div>
            ) : (
              <div className="yd-chat flex-1 min-h-0 relative">
                <div className="yd-chat-scroll">
                  <ol className="yd-chat-list">
                  {messages.map(msg => {
                    if (msg.system) {
                      return (
                        <li key={msg.id} className="yd-chat-system">
                          <span className="yd-chat-system-label">System · {msg.time}</span>
                          <span>{msg.text}</span>
                        </li>
                      );
                    }

                    const isMe = msg.sender === user?.id;
                    const repliedTo = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                    const authorName = getAuthorName(msg.sender);

                    const renderText = (txt: string) => {
                      return txt.split(' ').map((word, i) =>
                        word.startsWith('@') ? <strong key={i} className="yd-chat-mention">{word} </strong> : word + ' '
                      );
                    };

                    return (
                      <li key={msg.id} className={`yd-chat-row ${isMe ? 'is-mine' : ''}`}>
                        <div className="yd-chat-bubble-wrap">
                        <div className="yd-chat-cluster">
                        <div className="yd-chat-clip" data-yd-chat-anchor={msg.id}>
                        <article
                          className="yd-chat-bubble"
                          tabIndex={0}
                          aria-label={`${authorName}: ${msg.text}`}
                          {...getMessageProps(msg)}
                        >
                          {!isMe && (
                            <div className="yd-chat-author">
                              <button
                                type="button"
                                className="text-left"
                                onClick={() => msg.sender && setSelectedProfileUserId(msg.sender)}
                              >
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

                {/* Mentions Autocomplete Popup */}
                {showMentions && (
                  <div className="absolute bottom-full mb-2 left-4 right-4 bg-elevated border border-subtle rounded-xl shadow-xl overflow-hidden max-h-48 flex flex-col animate-in fade-in slide-in-from-bottom-2">
                    <button onClick={() => insertMention('all')} className="flex items-center gap-3 p-3 hover:bg-surface text-left border-b border-subtle">
                      <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center">@</div>
                      <div>
                        <div className="text-[13px] font-bold text-content-primary">Mention everyone</div>
                        <div className="text-[11px] text-content-muted">Notify all squad members</div>
                      </div>
                    </button>
                    {acceptedMembers.map(m => (
                      <button key={m.user_id} onClick={() => m.profiles?.username && insertMention(m.profiles.username)} className="flex items-center gap-3 p-3 hover:bg-surface text-left">
                        <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center">
                          {m.profiles?.avatar_url || '🎓'}
                        </div>
                        <div>
                          <div className="text-[13px] font-bold text-content-primary">{m.profiles?.display_name}</div>
                          <div className="text-[11px] text-content-muted">@{m.profiles?.username}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <footer className="yd-chat-composer">
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
                      placeholder="Message squad…"
                      value={message}
                      onChange={handleMessageChange}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                    />
                    <button
                      type="button"
                      className="yd-chat-send"
                      disabled={!message.trim()}
                      onClick={handleSend}
                      aria-label="Send message"
                    >
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

            {settingsOpen && (
              <SquadSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} squad={squad} members={members} onMembersChanged={fetchSquad} />
            )}

            {selectedProfileUserId && (
              <UserProfileSheet
                open={Boolean(selectedProfileUserId)}
                userId={selectedProfileUserId}
                onClose={() => setSelectedProfileUserId(null)}
                onFriendshipChange={() => void fetchSquad()}
              />
            )}
            
            {/* Click outside to close menus */}
            
          </>
        )}
      </div>
    </Overlay>
  );
}
