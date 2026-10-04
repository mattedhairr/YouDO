import { useState } from 'react';
import { X, UsersRound } from 'lucide-react';
import Overlay from './Overlay';
import { createSquad } from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';
import Toggle from './Toggle';
import { clampStreakBarHours, MAX_STREAK_BAR_HOURS, MIN_STREAK_BAR_HOURS } from '../lib/focusTrends';
import { hapticTick } from '../lib/haptics';

interface Props {
  personalPace: number;
  open: boolean;
  onClose: () => void;
  onSuccess: (squadId: string) => void;
}

export default function CreateRoomSheet({ open, onClose, onSuccess, personalPace }: Props) {
  const { user } = useAuth();
  
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🔥');
  const [barHours, setBarHours] = useState<number>(4);
  const [allowJoinRequests, setAllowJoinRequests] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Please give your squad a name.');
      return;
    }
    if (barHours !== personalPace) {
      setErrorMsg(`Mismatch! The room pace must match your personal target pace (${personalPace}h/day).`);
      return;
    }
    if (!user) return;

    setLoading(true);
    setErrorMsg('');

    const res = await createSquad(user.id, name.trim(), icon, barHours, allowJoinRequests);
    
    setLoading(false);
    if (res.ok && res.squad) {
      onSuccess(res.squad.id);
    } else {
      setErrorMsg(res.error || 'Could not create room.');
    }
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary flex items-center gap-1.5">
            <UsersRound size={16} /> Create Squad
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Room Name & Icon */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Squad Identity
            </label>
            <div className="flex gap-3">
              <div className="w-[52px] shrink-0">
                <select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full h-11 bg-elevated border border-subtle rounded-xl text-center text-xl outline-none focus:border-primary appearance-none cursor-pointer"
                >
                  {['🔥', '⚡', '🦉', '🚀', '🎯', '📚', '☕', '⚔️', '🌊', '🏔️', '🏆', '💎'].map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="e.g. The Night Owls"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                className="flex-1 bg-elevated border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Pace Target */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Daily Target Pace
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-12 h-10 rounded-[10px] border border-subtle bg-elevated text-content-primary text-sm font-semibold disabled:opacity-35 hover:bg-base transition-colors"
                disabled={barHours <= MIN_STREAK_BAR_HOURS}
                onClick={() => {
                  hapticTick();
                  setBarHours(clampStreakBarHours(barHours - 0.5));
                  setErrorMsg('');
                }}
              >
                —
              </button>
              <div className="flex-1 h-10 rounded-xl bg-elevated border border-subtle flex items-center justify-center">
                <span className="tabular-nums text-sm font-bold text-content-primary">
                  {barHours}h
                </span>
              </div>
              <button
                type="button"
                className="w-12 h-10 rounded-[10px] border border-subtle bg-elevated text-content-primary text-sm font-semibold disabled:opacity-35 hover:bg-base transition-colors"
                disabled={barHours >= MAX_STREAK_BAR_HOURS}
                onClick={() => {
                  hapticTick();
                  setBarHours(clampStreakBarHours(barHours + 0.5));
                  setErrorMsg('');
                }}
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-content-muted mt-2 leading-relaxed">
              Only members with this exact target can join. Must match your personal target ({personalPace}h).
            </p>
          </div>

          {/* Discoverability */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Privacy Settings
            </label>
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-elevated border border-subtle">
              <div>
                <p className="text-[13px] font-bold text-content-primary">Allow Join Requests</p>
                <p className="text-[11px] text-content-secondary mt-0.5 leading-snug pr-4">
                  Make this room visible in the Discover list so compatible people can ask to join.
                </p>
              </div>
              <Toggle
                checked={allowJoinRequests}
                label="List room in Discover"
                onChange={() => setAllowJoinRequests((v) => !v)}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-error-soft rounded-xl text-[12px] font-semibold text-error text-center">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            disabled={loading}
            onClick={handleCreate}
            className="w-full mt-2 h-12 rounded-[14px] bg-primary text-on-primary text-[14px] font-bold flex items-center justify-center disabled:opacity-50 transition active:scale-[0.98]"
          >
            {loading ? 'Creating...' : 'Create Squad Room'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
