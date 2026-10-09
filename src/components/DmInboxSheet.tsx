import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Send, MoreVertical, Reply, X } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { hapticSuccess } from '../lib/haptics';
import { fetchDirectMessages, sendDirectMessage, deleteDirectMessage, markDirectConversationRead } from '../lib/messages';
import { dismissDmNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import './chat/youDoChat.css';
import ChatActionSheet from './chat/ChatActionSheet';
import { useChatMessageGestures } from './chat/useChatMessageGestures';

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
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
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
    void dismissDmNotification(friendId);

    const channel = supabase
      .channel('dm_' + [user.id, friendId].sort().join('_'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
        void loadMessages();
        void markDirectConversationRead(user.id, friendId);
        void dismissDmNotification(friendId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, user, friendId, loadMessages]);

  const openActions = useCallback((msg: Message) => {
    setSelectedMessage(msg);
  }, []);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setSelectedMessage(null);
    inputRef.current?.focus();
  }, []);

  const { getMessageProps } = useChatMessageGestures<Message>({
    onOpenActions: openActions,
    onDoubleTapReply: handleReply,
  });

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

  const deleteMessage = async (id: string) => {
    setSelectedMessage(null);
    if (!user) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    await deleteDirectMessage(id, user.id);
  };

  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle bg-elevated shrink-0">
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

        <div className="yd-chat flex-1 min-h-0">
          <div className="yd-chat-scroll">
            <ol className="yd-chat-list">
              {messages.map(msg => {
                const isMe = msg.sender === user?.id;
                const repliedTo = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                const replyAuthor =
                  repliedTo?.sender === user?.id ? 'yourself' : friendName;

                return (
                  <li key={msg.id} className={`yd-chat-row ${isMe ? 'is-mine' : ''}`}>
                    <div className="yd-chat-bubble-wrap">
                    <div className="yd-chat-cluster">
                    <div className="yd-chat-clip" data-yd-chat-anchor={msg.id}>
                    <article
                      className="yd-chat-bubble"
                      tabIndex={0}
                      aria-label={`${isMe ? 'You' : friendName}: ${msg.text}`}
                      {...getMessageProps(msg)}
                    >
                      {!isMe && (
                        <div className="yd-chat-author">
                          <span>{friendName}</span>
                        </div>
                      )}
                      {msg.replyToId && repliedTo && (
                        <blockquote className="yd-chat-quote">
                          <strong>{replyAuthor}</strong>
                          <span>{repliedTo.text || 'Message unavailable'}</span>
                        </blockquote>
                      )}
                      <p className="yd-chat-body">{msg.text}</p>
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

          <footer className="yd-chat-composer">
            {replyingTo && (
              <div className="yd-chat-reply">
                <Reply size={16} className="shrink-0 text-secondary" />
                <span className="yd-chat-reply-text">
                  <strong>
                    Replying to {replyingTo.sender === user?.id ? 'yourself' : friendName}
                  </strong>
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
                placeholder="Message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
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
            {sendError && <p role="alert" className="yd-chat-alert">{sendError}</p>}
            <p className="yd-chat-hint">
              <span>Hold for options · double-tap to reply</span>
            </p>
          </footer>
        </div>

        <ChatActionSheet
          open={!!selectedMessage}
          onClose={() => setSelectedMessage(null)}
          authorName={selectedMessage ? (selectedMessage.sender === user?.id ? 'You' : friendName) : ''}
          time={selectedMessage?.time ?? ''}
          body={selectedMessage?.text ?? ''}
          canReply={true}
          onReply={() => { if (selectedMessage) handleReply(selectedMessage); }}
          canCopy={true}
          canDelete={selectedMessage?.sender === user?.id}
          deleteLabel="Delete message"
          onDelete={() => { if (selectedMessage) void deleteMessage(selectedMessage.id); }}
        />
      </div>
    </Overlay>
  );
}
