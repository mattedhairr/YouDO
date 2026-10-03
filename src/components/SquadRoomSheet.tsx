import { useState } from 'react';
import { ChevronLeft, ChevronDown, Settings, Send } from 'lucide-react';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SquadRoomSheet({ open, onClose }: Props) {
  const [goalType, setGoalType] = useState<'Daily' | 'Weekly' | 'Monthly'>('Weekly');
  const [activeTab, setActiveTab] = useState<'board' | 'chat'>('board');
  const [message, setMessage] = useState('');

  if (!open) return null;

  // Mock Data
  const members = [
    { id: '1', name: 'You', current: 20, target: 25, avatar: 'Y' },     // 80%
    { id: '2', name: 'Alex', current: 25, target: 25, avatar: 'A' },    // 100%
    { id: '3', name: 'Sam', current: 12, target: 25, avatar: 'S' },     // 48%
    { id: '4', name: 'Jamie', current: 25, target: 25, avatar: 'J' },   // 100%
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

        {/* Master Toggle (Board | Chat) */}
        <div className="px-4 py-3 bg-[var(--bg-default)] border-b border-subtle sticky top-0 z-10">
          <div className="flex bg-surface border border-subtle rounded-full p-1 max-w-[240px] mx-auto">
            <button
              onClick={() => setActiveTab('board')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                activeTab === 'board' ? 'bg-primary text-on-primary' : 'text-content-muted hover:text-content-primary'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                activeTab === 'chat' ? 'bg-primary text-on-primary' : 'text-content-muted hover:text-content-primary'
              }`}
            >
              Chat
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex flex-col bg-[var(--bg-default)]">
          {activeTab === 'board' ? (
            <div className="p-5">
              
              {/* Target Selector */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <button className="flex items-center gap-1.5 text-[12px] font-bold text-primary bg-primary-soft px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                    {goalType} Target <ChevronDown size={14} />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-content-muted font-medium">Team Total</p>
                  <p className="text-[14px] font-bold text-content-primary">{totalCurrent}h <span className="text-content-muted">/ {totalTarget}h</span></p>
                </div>
              </div>

              {/* T-SHAPE WATER PIPES (Bronze Gradient Design) */}
              <div className="bg-[var(--bg-default)] border border-subtle rounded-[24px] p-6 mb-8 shadow-sm">
                <div className="flex h-[200px] items-end justify-center gap-0">
                  {members.map((member, index) => {
                    const rawPct = (member.current / member.target) * 100;
                    const pct = Math.min(rawPct, 100);
                    
                    // The pipe represents 0-90%. The top cap represents 90-100%.
                    const pipePct = Math.min((pct / 90) * 100, 100);
                    const capPct = pct > 90 ? ((pct - 90) / 10) * 100 : 0;

                    const isFirst = index === 0;
                    const isLast = index === members.length - 1;

                    // We revert to the app's primary color with opacity fading
                    return (
                      <div key={member.id} className="flex-1 flex flex-col items-center h-full justify-end group">
                        
                        {/* The T-Shape Structure */}
                        <div className="w-full flex flex-col items-center h-[140px]">
                          
                          {/* Top Cap (Horizontal Spread) */}
                          <div className={`w-full h-5 bg-elevated border-y-2 border-subtle relative flex justify-center items-end z-10
                            ${isFirst ? 'border-l-2 rounded-tl-[8px]' : ''}
                            ${isLast ? 'border-r-2 rounded-tr-[8px]' : ''}
                          `}>
                            {/* Water rising vertically in the wide cap */}
                            <div 
                              className="w-full bg-primary transition-all duration-1000 ease-out shadow-[0_4px_12px_var(--primary)]"
                              style={{ 
                                height: `${capPct}%`,
                                borderRadius: (isFirst && capPct === 100) ? '6px 0 0 0' : (isLast && capPct === 100) ? '0 6px 0 0' : '0'
                              }}
                            />
                          </div>
                          
                          {/* Vertical Pipe */}
                          <div className="w-7 flex-1 bg-elevated border-x-2 border-b-2 border-subtle rounded-b-full relative overflow-hidden flex items-end -mt-[2px] z-0">
                            {/* Water rising vertically (visible at bottom, solid at top) */}
                            <div 
                              className="w-full bg-gradient-to-t from-primary/40 via-primary/75 to-primary transition-all duration-1000 ease-out relative"
                              style={{ height: `${pipePct}%` }}
                            >
                              {/* Subtle tip highlight */}
                              {pipePct > 0 && pipePct < 100 && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-white/30" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Member Info Below Pipe */}
                        <div className="mt-5 text-center w-full">
                          <div className="w-8 h-8 mx-auto rounded-full bg-surface border border-subtle flex items-center justify-center text-[11px] font-bold text-content-primary shadow-sm mb-1.5">
                            {member.avatar}
                          </div>
                          <p className="text-[12px] font-bold text-content-primary truncate">{member.name}</p>
                          <p className="text-[11px] text-content-muted font-medium mt-0.5">{member.current}h</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ACTIVITY BOARD */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-content-muted mb-4 px-1">
                  Activity Board
                </h3>
                <div className="space-y-3">
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                    <p className="text-[13px] text-content-primary">
                      <span className="font-bold">Alex</span> has completed his work and reached the top!
                    </p>
                  </div>
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                    <p className="text-[13px] text-content-primary">
                      <span className="font-bold">Jamie</span> has completed his work and reached the top!
                    </p>
                  </div>
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[16px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary/50" />
                    <p className="text-[13px] text-content-primary">
                      <span className="font-bold">You</span> logged 4 hours. Keep pushing to the cap!
                    </p>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            /* CHAT TAB */
            <div className="flex-1 flex flex-col">
              <div className="flex-1 p-4 flex flex-col justify-end min-h-[250px]">
                <div className="space-y-4">
                  <div className="flex items-end gap-2 opacity-50">
                    <div className="flex-1 border-b border-subtle" />
                    <span className="text-[10px] uppercase font-semibold text-content-muted">Today</span>
                    <div className="flex-1 border-b border-subtle" />
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-bold shrink-0">A</div>
                    <div>
                      <div className="bg-elevated border border-subtle px-3.5 py-2 rounded-[14px] rounded-tl-none">
                        <p className="text-[13px] text-content-primary">I hit my target for today!</p>
                      </div>
                      <p className="text-[10px] text-content-muted mt-1 ml-1">Alex • 2:15 PM</p>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold shrink-0">Y</div>
                    <div className="flex flex-col items-end">
                      <div className="bg-primary/20 border border-primary/30 px-3.5 py-2 rounded-[14px] rounded-tr-none">
                        <p className="text-[13px] text-primary">Awesome, I'm almost there. 4 more hours to go!</p>
                      </div>
                      <p className="text-[10px] text-content-muted mt-1 mr-1">4:30 PM</p>
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
          )}
        </div>
      </div>
    </Overlay>
  );
}
