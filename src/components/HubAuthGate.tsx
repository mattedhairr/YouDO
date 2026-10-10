import { useState } from 'react';
import {
  Globe,
  Lock,
  Sparkles,
  WifiOff,
  ArrowRight,
  TrendingUp,
  UsersRound,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Flame,
  MessageSquare,
} from 'lucide-react';
import { requestAccountAccess } from '../lib/storageKeys';

interface Props {
  tab: 'social' | 'private';
  isOffline?: boolean;
  onSwitchTab?: (tab: 'social' | 'private') => void;
}

export default function HubAuthGate({ tab, isOffline = false, onSwitchTab }: Props) {
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const isSocial = tab === 'social';

  const handleCheckConnection = () => {
    setCheckingNetwork(true);
    setTimeout(() => {
      setCheckingNetwork(false);
    }, 600);
  };

  const handleConnect = () => {
    requestAccountAccess();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full select-none animate-fadeIn">
      {/* Outer Glow Card */}
      <div className="relative w-full rounded-[28px] border border-primary/25 bg-gradient-to-b from-primary-soft/30 via-elevated/95 to-surface/90 p-6 sm:p-8 shadow-elevated overflow-hidden backdrop-blur-md">
        {/* Ambient Top Glow Orbs */}
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 size-40 rounded-full bg-primary/10 blur-3xl" />

        {/* Top Header Section */}
        <div className="relative text-center flex flex-col items-center">
          {/* Glowing Icon Shield */}
          <div className="relative mb-4">
            <div className="size-16 sm:size-18 rounded-[22px] bg-gradient-to-br from-primary to-primary-hover text-on-primary flex items-center justify-center shadow-elevated shadow-primary/30">
              {isSocial ? (
                <Globe size={30} strokeWidth={2.2} className="text-on-primary" />
              ) : (
                <Lock size={30} strokeWidth={2.2} className="text-on-primary" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-elevated border-2 border-surface flex items-center justify-center text-primary shadow-xs">
              <Sparkles size={12} strokeWidth={2.4} />
            </div>
          </div>

          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-[10.5px] font-bold uppercase tracking-[0.16em] text-primary mb-2.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span>{isSocial ? 'Public Focus Hub · Account Required' : 'Private Hub & Rooms · Account Required'}</span>
          </div>

          {/* Heading */}
          <h2 className="text-[22px] sm:text-[25px] font-extrabold text-content-primary tracking-tight leading-snug">
            {isSocial ? 'Join the Global Focus Board' : 'Unlock Private Study Rooms'}
          </h2>

          {/* Subtitle */}
          <p className="text-[12.5px] sm:text-[13px] text-content-secondary mt-2 leading-relaxed max-w-[340px] mx-auto">
            {isSocial
              ? 'Compete on global focus leaderboards, track daily study pace, and celebrate consistency with learners worldwide.'
              : 'Study together in live 4-member squad rooms, exchange 24h companion DMs, and build focus streaks by @username.'}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="relative mt-6 space-y-2.5">
          {isSocial ? (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingUp size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">Global & Periodic Leaderboards</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    Rank daily, weekly, and monthly by verified deep work sessions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Flame size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">Peer Recognition & Kudos</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    Acknowledge fellow study partners and stay motivated through mutual effort.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">Community Discussions</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    Participate in exam feeds and public chats tailored to your goals.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <UsersRound size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">4-Member Focus Squads</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    Collaborate with shared real-time progress capsules and room chat.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">Companion DMs & Streaks</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    1-on-1 private messaging and mutual streak tracking by @username.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-subtle/70 bg-surface/60 p-3 transition-colors hover:border-primary/30">
                <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-bold text-content-primary leading-tight">Privacy-First Identity</h4>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-snug">
                    Connect safely using only your @handle — your email address is never exposed.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Offline Alert Box (if detected offline) */}
        {isOffline && (
          <div className="relative mt-5 rounded-2xl border border-warning/30 bg-warning-soft/60 p-3.5 flex items-start gap-3 text-warning">
            <WifiOff size={18} className="shrink-0 mt-0.5 text-warning" />
            <div className="min-w-0">
              <h5 className="text-[12px] font-bold leading-tight">You are currently offline</h5>
              <p className="text-[11px] text-warning/90 mt-0.5 leading-snug">
                Connect to Wi-Fi or mobile data to sign in and access live focus rooms.
              </p>
              <button
                type="button"
                onClick={handleCheckConnection}
                disabled={checkingNetwork}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning/20 border border-warning/30 text-[10.5px] font-bold text-warning hover:bg-warning/30 transition-colors"
              >
                <RefreshCw size={11} className={checkingNetwork ? 'animate-spin' : ''} />
                <span>{checkingNetwork ? 'Checking…' : 'Check connection'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="relative mt-6 space-y-3">
          <button
            type="button"
            onClick={handleConnect}
            className="w-full h-12 rounded-[16px] bg-primary text-on-primary font-bold text-[13.5px] flex items-center justify-center gap-2 shadow-elevated shadow-primary/25 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Sparkles size={16} strokeWidth={2.4} />
            <span>Sign In or Create Account</span>
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>

          <p className="text-center text-[11px] text-content-muted flex items-center justify-center gap-1.5">
            <CheckCircle2 size={12} className="text-primary shrink-0" />
            <span>Takes 10 seconds · Seamlessly preserves your local goals &amp; tasks</span>
          </p>
        </div>

        {/* Tab switch hint */}
        {onSwitchTab && (
          <div className="mt-5 pt-4 border-t border-subtle/60 text-center">
            {isSocial ? (
              <button
                type="button"
                onClick={() => onSwitchTab('private')}
                className="text-[11.5px] font-semibold text-content-secondary hover:text-primary transition-colors"
              >
                Looking for private rooms and DMs? <span className="text-primary underline">Switch to Private Hub</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSwitchTab('social')}
                className="text-[11.5px] font-semibold text-content-secondary hover:text-primary transition-colors"
              >
                Looking for public rankings? <span className="text-primary underline">Switch to Public Board</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
