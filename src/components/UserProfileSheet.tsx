import { useState } from 'react';
import { UserPlus, ShieldCheck, X, ChevronDown, Lock } from 'lucide-react';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UserProfileSheet({ open, onClose }: Props) {
  // Dummy states to demonstrate dynamic UI
  const [focusWindow, setFocusWindow] = useState<'Today' | 'Week' | 'Month' | 'All-time'>('Week');
  const [statsPrivate] = useState(false); // Change to true to see the private layout

  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-t-[24px] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Profile</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Compact Header: Avatar & Info */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 shrink-0 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary text-2xl font-bold shadow-elevated">
              A
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[18px] font-bold text-content-primary truncate">Alex</h1>
              <p className="text-[13px] font-medium text-primary mt-0.5 truncate">@alex_study</p>
              <p className="text-[12px] text-content-secondary mt-1.5 leading-snug line-clamp-2">
                Preparing for GATE 2027. Let's sync focus and crush our goals together!
              </p>
            </div>
          </div>

          {/* Action Button */}
          <button className="w-full mt-5 bg-primary text-on-primary h-11 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            <UserPlus size={16} strokeWidth={2.5} />
            Add Friend
          </button>

          {/* Dynamic Focus Stats */}
          <div className="mt-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted mb-2.5 px-0.5">
              Focus Stats
            </h3>
            
            {statsPrivate ? (
              <div className="bg-elevated/50 border border-dashed border-subtle rounded-[14px] p-5 flex flex-col items-center justify-center text-content-muted">
                <Lock size={20} className="mb-2 opacity-50" />
                <p className="text-[12px] font-medium">This user keeps their stats private</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-elevated border border-subtle rounded-[14px] p-3.5 flex flex-col">
                  <span className="text-[11px] font-medium text-content-secondary mb-1">Current Streak</span>
                  <span className="text-[20px] font-bold text-content-primary">12 days</span>
                </div>
                
                <div className="bg-elevated border border-subtle rounded-[14px] p-3.5 flex flex-col relative group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-content-secondary">Total Focus</span>
                    <button className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary-soft px-1.5 py-0.5 rounded-md hover:bg-primary/20">
                      {focusWindow} <ChevronDown size={12} />
                    </button>
                  </div>
                  <span className="text-[20px] font-bold text-content-primary">
                    {focusWindow === 'Today' ? '2h 15m' : focusWindow === 'Week' ? '18h 30m' : focusWindow === 'Month' ? '72h' : '450h'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Mutual Communities */}
          <div className="mt-6 mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted mb-2.5 px-0.5">
              Mutual Communities
            </h3>
            <div className="bg-elevated border border-subtle rounded-[14px] p-3 flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-[10px] bg-secondary-soft text-secondary flex items-center justify-center border border-secondary/20">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-content-primary truncate">GATE 2027 Achievers</p>
                <p className="text-[11px] text-content-muted mt-0.5 truncate">Public Community</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
