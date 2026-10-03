import { useState } from 'react';
import { ChevronLeft, MoreVertical, Send, Target, Users } from 'lucide-react';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SquadRoomSheet({ open, onClose }: Props) {
  const [message, setMessage] = useState('');

  if (!open) return null;

  // Mock Data
  const squadGoal = 100; // 100 hours
  const currentTotal = 68; // 68 hours
  const progressPercent = (currentTotal / squadGoal) * 100;

  const members = [
    { id: '1', name: 'You', contribution: 24, avatar: 'Y', color: 'bg-primary-soft text-primary border-primary/20' },
    { id: '2', name: 'Alex', contribution: 18, avatar: 'A', color: 'bg-secondary-soft text-secondary border-secondary/20' },
    { id: '3', name: 'Sam', contribution: 15, avatar: 'S', color: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
    { id: '4', name: 'Jamie', contribution: 11, avatar: 'J', color: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  ];

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-t-[24px] flex flex-col h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-subtle bg-elevated rounded-t-[24px]">
          <button onClick={onClose} className="p-2 -ml-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="text-center">
            <h2 className="text-[15px] font-bold text-content-primary">GATE 2027 Achievers</h2>
            <p className="text-[11px] text-content-muted flex items-center justify-center gap-1 mt-0.5">
              <Users size={10} /> 4 members
            </p>
          </div>
          <button className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* TOP HALF: Stats & Contributions */}
          <div className="p-5 border-b border-subtle bg-[var(--bg-default)]">
            
            {/* Big Shared Progress Bar */}
            <div className="bg-elevated border border-subtle rounded-[16px] p-4 mb-5">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary flex items-center gap-1.5">
                    <Target size={12} /> Weekly Target
                  </p>
                  <p className="text-[22px] font-bold text-content-primary leading-tight mt-1">
                    {currentTotal}h <span className="text-[14px] text-content-muted font-medium">/ {squadGoal}h</span>
                  </p>
                </div>
                <div className="text-[13px] font-bold text-primary bg-primary-soft px-2 py-1 rounded-lg">
                  {Math.round(progressPercent)}%
                </div>
              </div>
              
              <div className="h-2.5 bg-track rounded-full overflow-hidden flex">
                {members.map((member) => (
                  <div 
                    key={member.id}
                    className="h-full border-r border-black/20 last:border-0"
                    style={{ 
                      width: `${(member.contribution / squadGoal) * 100}%`,
                      backgroundColor: member.name === 'You' ? 'var(--primary)' : 'var(--content-secondary)' 
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-content-secondary mt-2 text-center font-medium">
                32 hours remaining to hit the goal!
              </p>
            </div>

            {/* Contributions List */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted mb-3 px-1">
                Contributions
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 px-1 snap-x">
                {members.map((member) => (
                  <div key={member.id} className="snap-start shrink-0 bg-elevated border border-subtle rounded-[14px] p-3 w-[100px] flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center font-bold text-lg border mb-2 ${member.color}`}>
                      {member.avatar}
                    </div>
                    <p className="text-[12px] font-semibold text-content-primary truncate w-full text-center">{member.name}</p>
                    <p className="text-[11px] text-content-secondary mt-0.5">{member.contribution}h</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BOTTOM HALF: Chat */}
          <div className="flex-1 p-4 flex flex-col justify-end min-h-[250px]">
            {/* Dummy Messages */}
            <div className="space-y-4 mb-4">
              <div className="flex items-end gap-2 opacity-50">
                <div className="flex-1 border-b border-subtle" />
                <span className="text-[10px] uppercase font-semibold text-content-muted">Today</span>
                <div className="flex-1 border-b border-subtle" />
              </div>
              
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary-soft text-secondary flex items-center justify-center text-xs font-bold shrink-0">A</div>
                <div>
                  <div className="bg-elevated border border-subtle px-3.5 py-2 rounded-[14px] rounded-tl-none">
                    <p className="text-[13px] text-content-primary">I'm going to pull a 4-hour session tonight. We need to hit that 100h goal!</p>
                  </div>
                  <p className="text-[10px] text-content-muted mt-1 ml-1">Alex • 2:15 PM</p>
                </div>
              </div>

              <div className="flex gap-3 flex-row-reverse">
                <div className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-bold shrink-0">Y</div>
                <div className="flex flex-col items-end">
                  <div className="bg-primary/20 border border-primary/30 px-3.5 py-2 rounded-[14px] rounded-tr-none">
                    <p className="text-[13px] text-primary">Let's go! I'll join you in 30 mins.</p>
                  </div>
                  <p className="text-[10px] text-content-muted mt-1 mr-1">4:30 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Input */}
        <div className="p-3 border-t border-subtle bg-elevated rounded-b-[24px]">
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-subtle rounded-full pl-4 pr-1.5 py-1.5">
            <input 
              type="text" 
              placeholder="Send a message..."
              className="flex-1 bg-transparent text-[13px] text-content-primary outline-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${message.trim() ? 'bg-primary text-on-primary' : 'bg-surface text-content-muted'}`}>
              <Send size={14} className={message.trim() ? 'ml-0.5' : ''} />
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
