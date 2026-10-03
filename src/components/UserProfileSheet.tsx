import { UserPlus, ShieldCheck, X } from 'lucide-react';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UserProfileSheet({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-t-[24px] flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2">
          <div className="w-10" /> {/* Spacer */}
          <h2 className="text-[14px] font-bold text-content-primary">Profile</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {/* Avatar & Identity */}
          <div className="flex flex-col items-center mt-6">
            <div className="w-24 h-24 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary text-3xl font-bold shadow-elevated mb-4">
              A
            </div>
            <h1 className="text-xl font-bold text-content-primary">Arvind</h1>
            <p className="text-sm font-medium text-primary mt-0.5">@arvind_2027</p>
            <p className="text-[13px] text-content-secondary mt-3 max-w-[280px] text-center leading-relaxed">
              Preparing for GATE 2027. Let's sync focus and crush our goals together!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <button className="flex-1 bg-primary text-on-primary h-12 rounded-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <UserPlus size={18} strokeWidth={2.5} />
              Add Friend
            </button>
          </div>

          {/* Focus Stats */}
          <div className="mt-8">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-content-muted mb-3 px-1">
              Focus Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-elevated border border-subtle rounded-[16px] p-4 flex flex-col items-center">
                <span className="text-[22px] font-bold text-content-primary">12d</span>
                <span className="text-[11px] font-medium text-content-secondary mt-0.5">Current Streak</span>
              </div>
              <div className="bg-elevated border border-subtle rounded-[16px] p-4 flex flex-col items-center">
                <span className="text-[22px] font-bold text-content-primary">45h</span>
                <span className="text-[11px] font-medium text-content-secondary mt-0.5">Total Focus</span>
              </div>
            </div>
          </div>

          {/* Mutual Squads */}
          <div className="mt-8">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-content-muted mb-3 px-1">
              Mutual Squads
            </h3>
            <div className="bg-elevated border border-subtle rounded-[16px] p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-secondary-soft text-secondary flex items-center justify-center">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-content-primary">GATE 2027 Achievers</p>
                <p className="text-[12px] text-content-muted">4 members</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
