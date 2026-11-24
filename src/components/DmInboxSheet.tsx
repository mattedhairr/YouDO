import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Reply, Target, X } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { hapticSuccess } from '../lib/haptics';
import { fetchDirectMessages, sendDirectMessage, deleteDirectMessage, markDirectConversationRead } from '../lib/messages';
import { dismissDmNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { HubAvatar, HubNavBar } from './hub/HubParts';
import './chat/youDoChat.css';
import ChatActionSheet from './chat/ChatActionSheet';
import { useChatMessageGestures } from './chat/useChatMessageGestures';
import ShareGoalSheet from './chat/ShareGoalSheet';
import GoalShareCard from './chat/GoalShareCard';
import GoalSharePreview from './chat/GoalSharePreview';
import { useStore } from '../store';
import {
  buildGoalShare,
  goalShareMessage,
  goalShareTooBig,
  markGoalShareSaved,
  materializeGoalShare,
  parseGoalShare,
  readSavedGoalShares,
  type GoalShare,
} from '../lib/goalShare';

interface Props {
  open: boolean;
  onClose: () => void;
  friendId: string | null;
  friendName?: string;
  friendAvatar?: string;
  friendBacker?: boolean;
}

interface Message {
  id: string;
  sender: string | null | undefined;
  text: string;
  time: string;
  replyToId?: string;
  /** Set when the message carries a goal: the parsed share, or null if it can't be read. */
  goal?: GoalShare | null;
}

export default function DmInboxSheet({ open, onClose, friendId, friendName = 'Friend', friendAvatar = '', friendBacker = false }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [sendError, setSendError] = useState('');
  const { goals, applyGoalTreeChange } = useStore();
  const [shareOpen, setShareOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [savedShares, setSavedShares] = useState(readSavedGoalShares);
  const [saveError, setSaveError] = useState('');

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
        ...(d.goal_share != null ? { goal: parseGoalShare(d.goal_share) } : {}),
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

  const shareGoal = async (goalId: string, withProgress: boolean) => {
    const root = goals.find((goal) => goal.id === goalId);
    if (!root || !user || !friendId) return;
    const share = buildGoalShare(root, withProgress);
    if (goalShareTooBig(share)) {
      setSendError('This goal is too big to share.');
      setShareOpen(false);
      return;
    }
    const content = goalShareMessage(root.title);
    setShareOpen(false);
    setSendError('');

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, sender: user.id, text: content, time: 'Sending…', goal: share }]);

    const result = await sendDirectMessage(user.id, friendId, content, undefined, share);
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    if (result.ok) {
      hapticSuccess();
      await loadMessages();
    } else {
      setSendError(result.error || 'Could not share. Try again.');
    }
  };

  const saveGoal = (msg: Message) => {
    if (!msg.goal) return;
    setSaveError('');
    const result = applyGoalTreeChange(goals, [...goals, materializeGoalShare(msg.goal, goals)]);
    if (!result.ok) {
      setSaveError('Could not save the goal. Try again.');
      return;
    }
    hapticSuccess();
    setSavedShares(markGoalShareSaved(msg.id));
  };

  const previewMsg = previewId ? messages.find((m) => m.id === previewId) : undefined;

  const deleteMessage = async (id: string) => {
    setSelectedMessage(null);
    if (!user) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    await deleteDirectMessage(id, user.id);
  };

  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="hub hub-page">
        <HubNavBar
          title={friendName}
          subtitle="Messages disappear after 24 hours"
          onBack={onClose}
          backLabel="Back to chats"
          actions={<HubAvatar url={friendAvatar} name={friendName} size="sm" backer={friendBacker} />}
        />

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
                      className={`yd-chat-bubble ${msg.goal !== undefined ? 'is-goal' : ''}`}
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
                      {msg.goal !== undefined ? (
                        <GoalShareCard
                          share={msg.goal}
                          fromName={isMe ? null : friendName}
                          saved={savedShares.has(msg.id)}
                          onView={() => { setSaveError(''); setPreviewId(msg.id); }}
                          onSave={isMe || msg.id.startsWith('temp-') ? undefined : () => saveGoal(msg)}
                        />
                      ) : (
                        <p className="yd-chat-body">{msg.text}</p>
                      )}
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
              <button
                type="button"
                className="yd-chat-goal-btn"
                onClick={() => setShareOpen(true)}
                aria-label="Share a goal"
              >
                <Target size={19} />
              </button>
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
            {(sendError || saveError) && <p role="alert" className="yd-chat-alert">{sendError || saveError}</p>}
            <p className="yd-chat-hint">
              <span>Hold for options · double-tap to reply</span>
            </p>
          </footer>
        </div>

        <ShareGoalSheet
          open={shareOpen}
          goals={goals}
          friendName={friendName}
          onClose={() => setShareOpen(false)}
          onShare={(goalId, withProgress) => void shareGoal(goalId, withProgress)}
        />

        <GoalSharePreview
          share={previewMsg?.goal ?? null}
          fromName={previewMsg && previewMsg.sender !== user?.id ? friendName : null}
          saved={previewMsg ? savedShares.has(previewMsg.id) : false}
          error={saveError}
          onClose={() => setPreviewId(null)}
          onSave={previewMsg && previewMsg.sender !== user?.id && !previewMsg.id.startsWith('temp-') ? () => saveGoal(previewMsg) : undefined}
        />

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
