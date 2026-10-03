import { useState } from 'react';
import { ChevronLeft, ChevronDown, MessageSquare, Settings } from 'lucide-react';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SquadRoomSheet({ open, onClose }: Props) {
  const [goalType, setGoalType] = useState<'Daily' | 'Weekly' | 'Monthly'>('Weekly');

  if (!open) return null;

  // Mock Data
  // In this concept, everyone has to hit their 100% for the top to form a solid block.
  const members = [
    { id: '1', name: 'You', current: 20, target: 25, avatar: 'Y', colorFrom: 'from-primary/20', colorTo: 'to-primary', colorText: 'text-primary' },
    { id: '2', name: 'Alex', current: 25, target: 25, avatar: 'A', colorFrom: 'from-secondary/20', colorTo: 'to-secondary', colorText: 'text-secondary' },
    { id: '3', name: 'Sam', current: 12, target: 25, avatar: 'S', colorFrom: 'from-blue-500/20', colorTo: 'to-blue-500', colorText: 'text-blue-500' },
    { id: '4', name: 'Jamie', current: 25, target: 25, avatar: 'J', colorFrom: 'from-purple-500/20', colorTo: 'to-purple-500', colorText: 'text-purple-500' },
  ];

  const totalCurrent = members.reduce((sum, m) => sum + m.current, 0);
  const totalTarget = members.reduce((sum, m) => sum + m.target, 0);

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-t-[24px] flex flex-col h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-subtle bg-elevated rounded-t-[24px]">
          <button onClick={onClose} className="p-2 -ml-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="text-center flex-1">
            <h2 className="text-[16px] font-bold text-content-primary">GATE 2027 Achievers</h2>
          </div>
          <button className="p-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <Settings size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5">
          
          {/* Target Selector & Overall Progress */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <button className="flex items-center gap-1.5 text-[12px] font-bold text-primary bg-primary-soft px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                {goalType} Target <ChevronDown size={14} />
              </button>
              <p className="text-[12px] text-content-muted mt-2 font-medium">
                Team Total: <span className="text-content-primary font-bold">{totalCurrent}h</span> / {totalTarget}h
              </p>
            </div>
            <button className="flex items-center gap-2 bg-secondary-soft text-secondary px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-secondary/20 transition-colors">
              <MessageSquare size={16} />
              Open Chat
            </button>
          </div>

          {/* THE PILLARS (Vertical Progress) */}
          <div className="bg-elevated border border-subtle rounded-[20px] p-5 mb-8">
            <div className="flex gap-2 h-48 items-end relative">
              {/* Background grid lines (optional for aesthetics) */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-t border-content-primary w-full" />
                <div className="border-t border-content-primary w-full" />
                <div className="border-t border-content-primary w-full" />
                <div className="border-t border-content-primary w-full" />
              </div>

              {members.map((member) => {
                const pct = Math.min((member.current / member.target) * 100, 100);
                return (
                  <div key={member.id} className="flex-1 flex flex-col items-center h-full justify-end group">
                    
                    {/* The Bar */}
                    <div className="w-full relative bg-[var(--bg-default)] rounded-t-[10px] overflow-hidden shadow-inner h-full flex items-end">
                      <div 
                        className={`w-full rounded-t-[10px] bg-gradient-to-t ${member.colorFrom} ${member.colorTo} transition-all duration-1000 ease-out`}
                        style={{ height: `${pct}%` }}
                      >
                        {/* Dark tip indicator */}
                        {pct > 0 && (
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/30 rounded-t-[10px]" />
                        )}
                      </div>
                    </div>

                    {/* Member Info Below Bar */}
                    <div className="mt-3 text-center w-full">
                      <div className={`w-7 h-7 mx-auto rounded-full bg-surface border border-subtle flex items-center justify-center text-[10px] font-bold ${member.colorText} shadow-sm`}>
                        {member.avatar}
                      </div>
                      <p className="text-[11px] font-semibold text-content-primary mt-1.5 truncate">{member.name}</p>
                      <p className="text-[10px] text-content-muted">{member.current}h</p>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Mission Status Text */}
            <div className="mt-6 text-center border-t border-subtle pt-4">
              <p className="text-[12px] font-medium text-content-secondary">
                {totalCurrent >= totalTarget 
                  ? "Mission accomplished! The pillar is complete." 
                  : "We are missing pieces. Keep pushing to reach the top!"}
              </p>
            </div>
          </div>

          {/* ACTIVITY BOARD */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-content-muted mb-4 px-1">
              Activity Board
            </h3>
            <div className="space-y-3">
              <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-secondary" />
                <p className="text-[13px] text-content-primary">
                  <span className="font-bold">Alex</span> has done his work and hit 100%!
                </p>
              </div>
              <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <p className="text-[13px] text-content-primary">
                  <span className="font-bold">Jamie</span> has done his work and hit 100%!
                </p>
              </div>
              <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <p className="text-[13px] text-content-primary">
                  <span className="font-bold">You</span> logged 4 hours of focus time.
                </p>
              </div>
              <div className="bg-[var(--bg-default)] border border-dashed border-subtle p-3.5 rounded-[16px] flex items-center gap-3 opacity-60">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <p className="text-[13px] text-content-primary">
                  <span className="font-bold">Sam</span> is falling behind on today's target.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Overlay>
  );
}
