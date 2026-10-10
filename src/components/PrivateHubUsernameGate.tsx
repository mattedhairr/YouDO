import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  AtSign,
  ArrowRight,
  Loader2,
  AlertCircle,
  MessageCircle,
  UsersRound,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { upsertProfile, fetchProfile, resolvePrivateHubUsername, type Profile } from '../lib/profiles';

interface Props {
  user: User;
  initialDraft?: string;
  onSuccess: (profile: Profile) => void;
  onSwitchToPublic?: () => void;
}

export default function PrivateHubUsernameGate({
  user,
  initialDraft = '',
  onSuccess,
  onSwitchToPublic,
}: Props) {
  const [draftUsername, setDraftUsername] = useState(() => {
    return (
      initialDraft.replace(/^@/, '').toLowerCase().trim() ||
      resolvePrivateHubUsername(null, user.user_metadata, user.id) ||
      ''
    );
  });
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  useEffect(() => {
    const cleanInitial = initialDraft.replace(/^@/, '').toLowerCase().trim();
    if (cleanInitial && !draftUsername) {
      setDraftUsername(cleanInitial);
    }
  }, [initialDraft, draftUsername]);

  const cleanHandle = draftUsername.replace(/^@/, '').toLowerCase().trim();
  const isValidFormat = /^[a-z0-9_]{3,20}$/.test(cleanHandle);

  const metaFullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  const metaAvatar =
    typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanHandle) {
      setUsernameError('Please enter a username.');
      return;
    }

    if (!isValidFormat) {
      setUsernameError('Username must be 3–20 characters: letters, numbers, and underscores only.');
      return;
    }

    setSavingUsername(true);
    setUsernameError('');

    try {
      const { ok, error } = await upsertProfile({
        id: user.id,
        username: cleanHandle,
        display_name: metaFullName || cleanHandle,
        ...(metaAvatar ? { avatar_url: metaAvatar } : {}),
      });

      if (ok) {
        const saved = await fetchProfile(user.id);
        if (saved) {
          onSuccess(saved);
        } else {
          setUsernameError('Profile saved, but failed to load. Please try again.');
        }
      } else {
        setUsernameError(error || 'That username might already be taken.');
      }
    } catch {
      setUsernameError('Connection error. Please check your internet and try again.');
    } finally {
      setSavingUsername(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-28 max-w-md mx-auto w-full select-none animate-fadeIn">
      {/* Outer Card */}
      <div className="relative w-full rounded-[28px] border border-primary/25 bg-gradient-to-b from-primary-soft/30 via-elevated/95 to-surface/90 p-6 sm:p-8 shadow-elevated overflow-hidden backdrop-blur-md">
        {/* Ambient Top Glow Orbs */}
        <div className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 -bottom-8 size-36 rounded-full bg-primary/10 blur-3xl" />

        {/* Top Header Section */}
        <div className="relative text-center flex flex-col items-center">
          {/* Glowing Icon Container */}
          <div className="relative mb-4">
            <div className="size-16 sm:size-20 rounded-[22px] bg-gradient-to-br from-primary to-primary-hover text-on-primary flex items-center justify-center shadow-elevated shadow-primary/30">
              <AtSign size={32} strokeWidth={2.4} className="text-on-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-elevated border-2 border-surface flex items-center justify-center text-primary shadow-xs">
              <Sparkles size={12} strokeWidth={2.4} />
            </div>
          </div>

          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-[10.5px] font-bold uppercase tracking-[0.16em] text-primary mb-2.5">
            <span className="size-1.5 rounded-full bg-primary" />
            <span>Private Hub Entry · Set Identity</span>
          </div>

          {/* Title */}
          <h2 className="text-[22px] sm:text-[24px] font-extrabold text-content-primary tracking-tight leading-snug">
            Choose your @username
          </h2>

          {/* Subtitle */}
          <p className="text-[12.5px] sm:text-[13px] text-content-secondary mt-2 leading-relaxed max-w-[310px] mx-auto">
            Your handle represents you in squad rooms, companion requests, and DMs. Your email is never shared.
          </p>
        </div>

        {/* Account Info Pill */}
        <div className="relative mt-5 rounded-2xl border border-subtle/80 bg-surface/70 px-3.5 py-2.5 flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <UserIcon size={14} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted block leading-none">
              Signed in account
            </span>
            <span className="text-[12px] font-semibold text-content-primary truncate block mt-0.5">
              {metaFullName ? `${metaFullName} (${user.email})` : user.email}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="relative mt-5 space-y-4 text-left">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
              Unique Handle
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-[16px] pointer-events-none select-none">
                @
              </span>
              <input
                type="text"
                value={draftUsername}
                onChange={(e) => {
                  setDraftUsername(e.target.value.toLowerCase().replace(/^@/, ''));
                  if (usernameError) setUsernameError('');
                }}
                placeholder="alex_study"
                maxLength={20}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-surface border-2 border-subtle rounded-2xl py-3 pl-9 pr-14 font-bold text-content-primary text-[14px] placeholder:text-content-muted/60 focus:border-primary focus:outline-none transition-colors"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-content-muted pointer-events-none">
                {cleanHandle.length}/20
              </span>
            </div>

            {/* Validation note or error */}
            {usernameError ? (
              <div className="flex items-center gap-1.5 text-error text-[11.5px] mt-2 ml-1 font-medium">
                <AlertCircle size={13} className="shrink-0" />
                <span>{usernameError}</span>
              </div>
            ) : (
              <p className="text-[11px] text-content-muted mt-1.5 ml-1">
                3–20 characters: lowercase letters, numbers, and underscores only.
              </p>
            )}
          </div>

          {/* Feature List */}
          <ul className="space-y-2 pt-1 border-t border-subtle/50 text-[11.5px] text-content-secondary">
            {[
              { icon: MessageCircle, text: 'Exchange ephemeral 24h DMs with study partners' },
              { icon: UsersRound, text: 'Create or join focused 4-member squad rooms' },
              { icon: ShieldCheck, text: 'Private identity: No phone number or email exposure' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon size={14} className="shrink-0 mt-0.5 text-primary" strokeWidth={2.4} />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          {/* Primary Action Button */}
          <button
            type="submit"
            disabled={savingUsername || !isValidFormat}
            className="w-full h-12 rounded-[16px] bg-primary text-on-primary font-bold text-[13.5px] flex items-center justify-center gap-2 shadow-elevated shadow-primary/25 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer mt-4"
          >
            {savingUsername ? (
              <>
                <Loader2 className="animate-spin" size={17} />
                <span>Claiming handle…</span>
              </>
            ) : (
              <>
                <span>Claim Username &amp; Enter</span>
                <ArrowRight size={17} strokeWidth={2.4} />
              </>
            )}
          </button>
        </form>

        {/* Bottom Public Hub link */}
        {onSwitchToPublic && (
          <div className="mt-5 pt-4 border-t border-subtle/60 text-center">
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="text-[11.5px] font-semibold text-content-secondary hover:text-primary transition-colors"
            >
              Want to check public leaderboards first? <span className="text-primary underline">View Public Board</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
