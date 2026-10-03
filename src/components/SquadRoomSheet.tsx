import { useState } from 'react';
import { ChevronLeft, Settings, Send, ChevronDown } from 'lucide-react';
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

  const goals = { Daily: 5, Weekly: 25, Monthly: 100 };
  const target = goals[goalType];

  const members = [
    { id: '1', name: 'You',   avatar: 'Y', current: { Daily: 4,  Weekly: 20, Monthly: 72 } },
    { id: '2', name: 'Alex',  avatar: 'A', current: { Daily: 5,  Weekly: 25, Monthly: 100 } },
    { id: '3', name: 'Sam',   avatar: 'S', current: { Daily: 2,  Weekly: 12, Monthly: 45 } },
    { id: '4', name: 'Jamie', avatar: 'J', current: { Daily: 5,  Weekly: 25, Monthly: 98 } },
  ];

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-t-[24px] flex flex-col h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle bg-elevated rounded-t-[24px]">
          <button onClick={onClose} className="p-2 -ml-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-[16px] font-bold text-content-primary flex-1 text-center">GATE 2027 Achievers</h2>
          <button className="p-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-surface transition-colors">
            <Settings size={20} />
          </button>
        </div>

        {/* Board / Chat Toggle */}
        <div className="px-4 py-3 bg-[var(--bg-default)] border-b border-subtle">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'board' ? (
            <div className="p-5 space-y-6">

              {/* Target Selector */}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-content-secondary">Target Period</p>
                <div className="flex bg-elevated border border-subtle rounded-xl p-1 gap-1">
                  {(['Daily', 'Weekly', 'Monthly'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setGoalType(t)}
                      className={`px-3 py-1 text-[12px] font-semibold rounded-lg transition-colors ${
                        goalType === t ? 'bg-primary text-on-primary' : 'text-content-muted hover:text-content-primary'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shared Team Progress Bar */}
              {(() => {
                const totalCurrent = members.reduce((sum, m) => sum + m.current[goalType], 0);
                const totalTarget = members.length * target;
                const teamPct = Math.min((totalCurrent / totalTarget) * 100, 100);
                return (
                  <div className="bg-elevated border border-subtle rounded-[18px] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-bold text-content-primary">Team Progress</p>
                      <p className="text-[12px] font-bold text-primary">{totalCurrent}h / {totalTarget}h</p>
                    </div>
                    <div className="h-3 bg-[var(--bg-default)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${teamPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-content-muted mt-2">{Math.round(teamPct)}% of team {goalType.toLowerCase()} target complete</p>
                  </div>
                );
              })()}

              {/* Individual Members */}
              <div className="bg-elevated border border-subtle rounded-[18px] divide-y divide-subtle overflow-hidden">
                {members.map((member) => {
                  const current = member.current[goalType];
                  const pct = Math.min((current / target) * 100, 100);
                  const done = current >= target;
                  const overdo = current > target ? current - target : 0;

                  return (
                    <div key={member.id} className="p-4">
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                          {member.avatar}
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-content-primary">{member.name}</p>
                          <p className={`text-[12px] font-bold ${done ? 'text-primary' : 'text-content-secondary'}`}>
                            {Math.min(current, target)}h / {target}h
                          </p>
                        </div>
                      </div>

                      {/* Horizontal Progress Bar */}
                      <div className="h-2 bg-[var(--bg-default)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Status Row */}
                      <div className="mt-2 flex items-center justify-between">
                        {done ? (
                          <p className="text-[11px] text-primary font-semibold">✓ Target hit!</p>
                        ) : (
                          <p className="text-[11px] text-content-muted">{target - current}h remaining</p>
                        )}
                        {overdo > 0 && (
                          <p className="text-[11px] text-primary/70 font-medium">+{overdo}h overdo contribution</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Activity Board */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-content-muted mb-3 px-0.5">
                  Activity Board
                </h3>
                <div className="space-y-2.5">
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[14px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <p className="text-[13px] text-content-primary"><span className="font-bold">Alex</span> has hit the {goalType.toLowerCase()} target!</p>
                  </div>
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[14px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <p className="text-[13px] text-content-primary"><span className="font-bold">Jamie</span> has hit the {goalType.toLowerCase()} target!</p>
                  </div>
                  <div className="bg-elevated border border-subtle p-3.5 rounded-[14px] flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
                    <p className="text-[13px] text-content-primary"><span className="font-bold">You</span> logged 4 hours of focus.</p>
                  </div>
                  <div className="bg-[var(--bg-default)] border border-dashed border-subtle p-3.5 rounded-[14px] flex items-center gap-3 opacity-60">
                    <div className="w-2 h-2 rounded-full bg-content-muted shrink-0" />
                    <p className="text-[13px] text-content-primary"><span className="font-bold">Sam</span> is behind on the target.</p>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            /* Chat Tab */
            <div className="flex-1 flex flex-col h-full">
              <div className="flex-1 p-4 flex flex-col justify-end min-h-[300px]">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 opacity-50">
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
                        <p className="text-[13px] text-primary">4 more hours to go. Let's get it!</p>
                      </div>
                      <p className="text-[10px] text-content-muted mt-1 mr-1">4:30 PM</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-subtle bg-elevated">
                <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-subtle rounded-full pl-4 pr-1.5 py-1.5">
                  <input
                    type="text"
                    placeholder="Send a message..."
                    className="flex-1 bg-transparent text-[13px] text-content-primary outline-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${message.trim() ? 'bg-primary text-on-primary' : 'bg-surface text-content-muted'}`}>
                    <Send size={14} />
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
