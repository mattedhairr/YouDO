import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Settings, Send, Reply, Copy, Trash2, X } from 'lucide-react';
import Overlay from './Overlay';
import SquadSettingsSheet from './SquadSettingsSheet';
import { getSquadDetails, type Squad } from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';
import { hapticTick, hapticSuccess } from '../lib/haptics';
import { fetchSquadMessages, sendSquadMessage, deleteSquadMessage } from '../lib/messages';
import { supabase } from '../lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  squadId: string | null;
}

interface Message {
  id: string;
  sender: string | null | undefined;
  text: string;
  time: string;
  replyToId?: string;
  system?: boolean;
}

export default function SquadRoomSheet({ open, onClose, squadId }: Props) {
  const { user } = useAuth();
  const [goalType, setGoalType] = useState<'Daily' | 'Weekly' | 'Monthly'>('Weekly');
  const [activeTab, setActiveTab] = useState<'board' | 'chat'>('board');
  const [message, setMessage] = useState('');
  
  const [squad, setSquad] = useState<Squad | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Advanced Chat State
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!activeMenu) return;
    const handleOutsideClick = () => setActiveMenu(null);
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [activeMenu]);
  const [showMentions, setShowMentions] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSquad = async () => {
    if (!squadId) return;
    setLoading(true);
    const res = await getSquadDetails(squadId);
    if (res) {
      setSquad(res.squad);
      setMembers(res.members);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && squadId) fetchSquad();
  }, [open, squadId]);

  // Mock chat history
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'sys', text: "Welcome! Only members with this target can join.", time: "9:00 AM", system: true }
  ]);
  
  useEffect(() => {
    if (!open || !squadId) return;
    
    const loadMessages = async () => {
      const data = await fetchSquadMessages(squadId);
      setMessages([
        { id: '1', sender: 'sys', text: "Welcome! Only members with this target can join.", time: "9:00 AM", system: true },
        ...data.map(d => ({
          id: d.id,
          sender: d.sender_id,
          text: d.content,
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          replyToId: d.reply_to_id || undefined
        }))
      ]);
    };
    
    loadMessages();
    
    const channel = supabase.channel('squad_' + squadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_messages', filter: 'squad_id=eq.' + squadId }, () => {
         loadMessages();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [open, squadId]);

  if (!open || !squadId) return null;

  const barHours = squad?.bar_hours || 4; 
  const goals = { Daily: barHours, Weekly: barHours * 7, Monthly: barHours * 30 };
  const target = goals[goalType];
  const acceptedMembers = members.filter(m => m.status === 'accepted');

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

  const handleDoubleTap = (msg: Message) => {
    if (msg.system) return;
    hapticTick();
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const handleTap = (msg: Message) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTap(msg);
    }
    lastTapRef.current = now;
  };

  const handleTouchStart = (msg: Message) => {
    if (msg.system) return;
    pressTimer.current = setTimeout(() => {
      hapticTick();
      setActiveMenu(msg.id);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const deleteMessage = async (id: string) => {
    setActiveMenu(null);
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
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto flex flex-col h-full" onClick={() => setActiveMenu(null)}>
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
              <div className="flex-1 overflow-y-auto p-5">
                 {/* Progress Board unchanged... */}
                 <div className="space-y-4">
                  {acceptedMembers.map((m) => {
                    const progress = barHours * 5; // Mock progress
                    const percent = Math.min(100, Math.round((progress / target) * 100));
                    const isWinning = percent >= 100;
                    return (
                      <div key={m.user_id} className="bg-elevated border border-subtle rounded-[16px] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary-soft text-primary text-sm font-bold flex items-center justify-center border border-primary/20">
                              {m.profiles?.avatar_url || '🎓'}
                            </div>
                            <span className="text-[13px] font-bold text-content-primary">{m.profiles?.display_name}</span>
                          </div>
                          <span className={`text-[12px] font-bold ${isWinning ? 'text-success' : 'text-primary'}`}>
                            {progress.toFixed(1)}h <span className="text-content-muted font-medium">/ {target}h</span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-[var(--bg-default)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${isWinning ? 'bg-success' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-[var(--bg-default)] relative">
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
                  {messages.map(msg => {
                    if (msg.system) {
                      return (
                        <div key={msg.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface border border-subtle flex items-center justify-center text-xs font-bold text-content-secondary shrink-0">
                            SYS
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-[12px] font-bold text-content-primary">System</span>
                              <span className="text-[10px] text-content-muted">{msg.time}</span>
                            </div>
                            <div className="bg-elevated border border-subtle rounded-2xl rounded-tl-none p-3 text-[13px] text-content-secondary">
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const isMe = msg.sender === user?.id;
                    const repliedTo = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                    const authorName = getAuthorName(msg.sender);

                    // Bold @mentions
                    const renderText = (txt: string) => {
                      return txt.split(' ').map((word, i) => 
                        word.startsWith('@') ? <strong key={i} className="text-primary font-bold">{word} </strong> : word + ' '
                      );
                    };

                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
                        {msg.replyToId && (
                          <div className={`text-[11px] text-content-muted mb-1 px-2 ${isMe ? 'text-right' : 'text-left'}`}>
                            Replying to {getAuthorName(repliedTo?.sender)}
                            <div className="line-clamp-1 opacity-70 italic">"{repliedTo?.text || 'Message unavailable'}"</div>
                          </div>
                        )}
                        <div 
                          onClick={() => handleTap(msg)}
                          onTouchStart={() => handleTouchStart(msg)}
                          onTouchEnd={handleTouchEnd}
                          onTouchMove={handleTouchEnd}
                          onMouseDown={() => handleTouchStart(msg)}
                          onMouseUp={handleTouchEnd}
                          onMouseLeave={handleTouchEnd}
                          className={`max-w-[85%] rounded-2xl p-3 text-[13.5px] leading-relaxed cursor-pointer transition-transform active:scale-[0.98] ${
                            isMe 
                              ? 'bg-primary text-on-primary rounded-tr-sm' 
                              : 'bg-elevated border border-subtle text-content-primary rounded-tl-sm'
                          }`}
                        >
                          {!isMe && <div className="text-[11px] font-bold mb-1 opacity-80">{authorName}</div>}
                          {renderText(msg.text)}
                        </div>
                        <span className="text-[10px] text-content-muted mt-1.5 px-1">{msg.time}</span>

                        {/* Long Press Menu Overlay */}
                        {activeMenu === msg.id && (
                          <div onClick={(e) => e.stopPropagation()} className={`absolute z-10 bottom-full mb-2 bg-elevated border border-subtle shadow-xl rounded-xl p-1 flex gap-1 animate-in slide-in-from-bottom-2 fade-in ${isMe ? 'right-0' : 'left-0'}`}>
                            <button onClick={() => { setReplyingTo(msg); setActiveMenu(null); inputRef.current?.focus(); }} className="p-2 hover:bg-surface rounded-lg text-content-primary flex flex-col items-center gap-1">
                              <Reply size={16} />
                              <span className="text-[9px] font-bold">Reply</span>
                            </button>
                            
                            {isMe && (
                              <button onClick={() => deleteMessage(msg.id)} className="p-2 hover:bg-error-soft rounded-lg text-error flex flex-col items-center gap-1">
                                <Trash2 size={16} />
                                <span className="text-[9px] font-bold">Delete</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      <button key={m.user_id} onClick={() => insertMention(m.profiles?.username)} className="flex items-center gap-3 p-3 hover:bg-surface text-left">
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

                {/* Chat Input */}
                <div className="p-4 bg-surface border-t border-subtle">
                  {replyingTo && (
                    <div className="mb-3 px-3 py-2 bg-elevated border border-subtle rounded-xl flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-primary block mb-0.5">
                          Replying to {getAuthorName(replyingTo.sender)}
                        </span>
                        <span className="text-[12px] text-content-secondary line-clamp-1">{replyingTo.text}</span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="text-content-muted hover:text-content-primary mt-0.5">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 bg-elevated border border-subtle rounded-full pl-4 pr-1.5 py-1.5 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Message squad..."
                      value={message}
                      onChange={handleMessageChange}
                      className="flex-1 bg-transparent text-[13.5px] text-content-primary outline-none placeholder:text-content-muted"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                    />
                    <button
                      type="button"
                      disabled={!message.trim()}
                      onClick={handleSend}
                      className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-50 transition-opacity shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                  <p className="text-[10px] text-content-muted mt-2 px-1">Room chat disappears after 24 hours · hold for options</p>
                </div>
              </div>
            )}

            {settingsOpen && (
              <SquadSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} squad={squad} members={members} onMembersChanged={fetchSquad} />
            )}
            
            {/* Click outside to close menus */}
            
          </>
        )}
      </div>
    </Overlay>
  );
}
