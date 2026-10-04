import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Send, MoreVertical, Reply, Copy, Trash2, X } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { hapticTick, hapticSuccess } from '../lib/haptics';
import { fetchDirectMessages, sendDirectMessage, deleteDirectMessage, markDirectConversationRead } from '../lib/messages';
import { supabase } from '../lib/supabase';
import { ProfileAvatarVisual } from '../lib/profileAvatar';

interface Props {
  open: boolean;
  onClose: () => void;
  friendId: string | null;
  friendName?: string;
  friendAvatar?: string;
}

interface Message {
  id: string;
  sender: string | null | undefined;
  text: string;
  time: string;
  replyToId?: string;
}

export default function DmInboxSheet({ open, onClose, friendId, friendName = 'Friend', friendAvatar = '' }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!activeMenu) return;
    const handleOutsideClick = () => setActiveMenu(null);
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, [activeMenu]);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [sendError, setSendError] = useState('');

  const loadMessages = useCallback(async () => {
    if (!user || !friendId) return;
    const data = await fetchDirectMessages(user.id, friendId);
    setMessages(
      data.map((d) => ({
        id: d.id,
        sender: d.sender_id,
        text: d.content,
        time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        replyToId: d.reply_to_id || undefined,
      })),
    );
  }, [user, friendId]);

  useEffect(() => {
    if (!open || !user || !friendId) return;

    void loadMessages();
    void markDirectConversationRead(user.id, friendId);

    const channel = supabase
      .channel('dm_' + [user.id, friendId].sort().join('_'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
        void loadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, user, friendId, loadMessages]);

  if (!open) return null;

  const handleSend = async () => {
    if (!message.trim() || !user || !friendId) return;
    const content = message.trim();
    const replyId =
      replyingTo?.id && /^[0-9a-f-]{36}$/i.test(replyingTo.id) ? replyingTo.id : undefined;
    setMessage('');
    setReplyingTo(null);
    setSendError('');

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, sender: user.id, text: content, time: 'Sending…', replyToId: replyId }]);

    const result = await sendDirectMessage(user.id, friendId, content, replyId);
    if (result.ok) {
      hapticSuccess();
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      await loadMessages();
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(result.error || 'Could not send. Try again.');
    }
  };

  const handleDoubleTap = (msg: Message) => {
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

  const handleTouchStart = (msgId: string) => {
    pressTimer.current = setTimeout(() => {
      hapticTick();
      setActiveMenu(msgId);
    }, 500); // 500ms long press
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
    await deleteDirectMessage(id, user.id);
  };

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto flex flex-col h-full" onClick={() => setActiveMenu(null)}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle bg-elevated">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1 -ml-1 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary-soft border border-primary/20 text-primary text-sm font-bold flex items-center justify-center overflow-hidden">
                <ProfileAvatarVisual avatarUrl={friendAvatar} displayName={friendName} className="text-sm" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-content-primary leading-none">{friendName}</h2>
                <span className="text-[11px] text-content-muted font-medium">24-hour chat</span>
              </div>
            </div>
          </div>
          
          <button className="p-1.5 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg-default)]">
          {messages.map(msg => {
            const isMe = msg.sender === user?.id;
            const repliedTo = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
                {msg.replyToId && (
                  <div className={`text-[11px] text-content-muted mb-1 px-2 ${isMe ? 'text-right' : 'text-left'}`}>
                    Replying to {repliedTo?.sender === user?.id ? 'yourself' : friendName}
                    <div className="line-clamp-1 opacity-70 italic">"{repliedTo?.text || 'Message unavailable'}"</div>
                  </div>
                )}
                <div 
                  onClick={() => handleTap(msg)}
                          onTouchStart={() => handleTouchStart(msg.id)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  onMouseDown={() => handleTouchStart(msg.id)}
                  onMouseUp={handleTouchEnd}
                  onMouseLeave={handleTouchEnd}
                  className={`max-w-[80%] rounded-2xl p-3 text-[13.5px] leading-relaxed cursor-pointer transition-transform active:scale-[0.98] ${
                    isMe 
                      ? 'bg-primary text-on-primary rounded-tr-sm' 
                      : 'bg-elevated border border-subtle text-content-primary rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-content-muted mt-1.5 px-1">{msg.time}</span>

                {/* Long Press Menu Overlay */}
                {activeMenu === msg.id && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute z-[100] bottom-full mb-2 bg-elevated border border-subtle shadow-xl rounded-xl p-1 flex gap-1 animate-in slide-in-from-bottom-2 fade-in">
                    <button 
                      onClick={() => { setReplyingTo(msg); setActiveMenu(null); inputRef.current?.focus(); }}
                      className="p-2 hover:bg-surface rounded-lg text-content-primary flex flex-col items-center gap-1"
                    >
                      <Reply size={16} />
                      <span className="text-[9px] font-bold">Reply</span>
                    </button>
                    
                    {isMe && (
                      <button 
                        onClick={() => deleteMessage(msg.id)}
                        className="p-2 hover:bg-error-soft rounded-lg text-error flex flex-col items-center gap-1"
                      >
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

        {/* Input Area */}
        <div className="p-4 bg-surface border-t border-subtle">
          {replyingTo && (
            <div className="mb-3 px-3 py-2 bg-elevated border border-subtle rounded-xl flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold text-primary block mb-0.5">
                  Replying to {replyingTo.sender === user?.id ? 'yourself' : friendName}
                </span>
                <span className="text-[12px] text-content-secondary line-clamp-1">{replyingTo.text}</span>
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-content-muted hover:text-content-primary mt-0.5">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-elevated border border-subtle rounded-full pl-4 pr-1.5 py-1.5">
            <input
              ref={inputRef}
              type="text"
              placeholder="Message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 bg-transparent text-[13.5px] text-content-primary outline-none placeholder:text-content-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
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
          {sendError && <p className="text-[11px] text-error mt-2 px-1">{sendError}</p>}
          <p className="text-[10px] text-content-muted mt-2 px-1">Hold for options · double-tap to reply</p>
        </div>
        
      </div>
    </Overlay>
  );
}
