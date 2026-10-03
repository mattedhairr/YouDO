import { useState } from 'react';
import { Bell, UserPlus, UsersRound, Lock } from 'lucide-react';
import BoardView from './BoardView';
import UserProfileSheet from './UserProfileSheet';
import SquadRoomSheet from './SquadRoomSheet';

export default function HubView({ onOpenBoardSettings }: { onOpenBoardSettings: () => void }) {
  const [activeTab, setActiveTab] = useState<'social' | 'private'>('social');
  const [privateSubTab, setPrivateSubTab] = useState<'dms' | 'rooms'>('dms');
  const [showTestProfile, setShowTestProfile] = useState(false);
  const [showTestRoom, setShowTestRoom] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Master Toggle */}
      <div className="py-2 sticky top-0 z-10 bg-[var(--bg-default)]">
        <div className="flex bg-surface border border-subtle rounded-full p-1 max-w-[240px] mx-auto">
          <button
            onClick={() => setActiveTab('social')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              activeTab === 'social' ? 'bg-primary text-on-primary' : 'text-content-muted'
            }`}
          >
            Social
          </button>
          <button
            onClick={() => setActiveTab('private')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              activeTab === 'private' ? 'bg-primary text-on-primary' : 'text-content-muted'
            }`}
          >
            Private
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'social' ? (
          <BoardView onOpenBoardSettings={onOpenBoardSettings} />
        ) : (
          <div className="py-2">
            {/* Private Sub-tabs and Actions */}
            <div className="flex items-center justify-between border-b border-subtle pb-3 mb-4">
              <div className="flex gap-5 px-1">
                <button
                  onClick={() => setPrivateSubTab('dms')}
                  className={`text-[15px] font-semibold transition-colors relative ${
                    privateSubTab === 'dms' ? 'text-primary' : 'text-content-muted'
                  }`}
                >
                  DMs
                  {privateSubTab === 'dms' && (
                    <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                  )}
                </button>
                <button
                  onClick={() => setPrivateSubTab('rooms')}
                  className={`text-[15px] font-semibold transition-colors relative ${
                    privateSubTab === 'rooms' ? 'text-primary' : 'text-content-muted'
                  }`}
                >
                  Rooms
                  {privateSubTab === 'rooms' && (
                    <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                  )}
                </button>
              </div>

              {/* Top Right Actions */}
              <div className="flex items-center gap-4 pr-1 text-content-secondary">
                <button className="hover:text-primary transition-colors" title="Notifications">
                  <Bell size={18} strokeWidth={2.2} />
                </button>
                <button className="grid place-items-center size-7 rounded-full bg-primary-soft text-primary hover:bg-primary hover:text-on-primary transition-colors" title={privateSubTab === 'dms' ? 'Add Friend' : 'Create Room'}>
                  {privateSubTab === 'dms' ? <UserPlus size={15} strokeWidth={2.5} /> : <UsersRound size={15} strokeWidth={2.5} />}
                </button>
              </div>
            </div>

            {/* Private Content: DMs or Rooms */}
            {privateSubTab === 'dms' ? (
              <div className="space-y-2.5">
                {/* DM Conversations List */}
                <div
                  onClick={() => setShowTestProfile(true)}
                  className="bg-elevated border border-subtle rounded-[16px] p-3.5 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
                >
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      A
                    </div>
                    {/* Active focus green dot */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[var(--bg-surface)]" title="Currently Focusing" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-bold text-content-primary truncate">Alex</p>
                      <span className="text-[10px] text-content-muted font-medium">5m ago</span>
                    </div>
                    <p className="text-[12px] text-content-secondary truncate">
                      Let's push for the 4-hour target tonight!
                    </p>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                    1
                  </div>
                </div>

                <div
                  onClick={() => setShowTestProfile(true)}
                  className="bg-elevated border border-subtle rounded-[16px] p-3.5 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
                >
                  <div className="w-11 h-11 rounded-full bg-surface border border-subtle flex items-center justify-center text-content-secondary font-bold text-sm">
                    S
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-bold text-content-primary truncate">Sam</p>
                      <span className="text-[10px] text-content-muted font-medium">2h ago</span>
                    </div>
                    <p className="text-[12px] text-content-muted truncate">
                      Logged 2 hours today, joining in the morning.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setShowTestProfile(true)}
                  className="bg-elevated border border-subtle rounded-[16px] p-3.5 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
                >
                  <div className="w-11 h-11 rounded-full bg-surface border border-subtle flex items-center justify-center text-content-secondary font-bold text-sm">
                    J
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-bold text-content-primary truncate">Jamie</p>
                      <span className="text-[10px] text-content-muted font-medium">Yesterday</span>
                    </div>
                    <p className="text-[12px] text-content-muted truncate">
                      Target hit! See you on the companion board.
                    </p>
                  </div>
                </div>

                <p className="text-center text-[11px] text-content-muted pt-4">
                  Tap any friend to view their profile & stats
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Room Card 1 */}
                <div
                  onClick={() => setShowTestRoom(true)}
                  className="bg-elevated border border-subtle rounded-[18px] p-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99] group"
                >
                  {/* Title & Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Lock size={13} className="text-content-muted" />
                        <h3 className="text-[14px] font-bold text-content-primary group-hover:text-primary transition-colors">
                          GATE 2027 Achievers
                        </h3>
                      </div>
                      <p className="text-[11px] text-content-muted mt-0.5">4 companions</p>
                    </div>
                    <span className="text-[10px] font-bold text-primary bg-primary-soft border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                      ⚡ 4h/day
                    </span>
                  </div>

                  {/* Companion Progress Bar */}
                  <div className="space-y-1.5 mt-3 pt-3 border-t border-subtle">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-content-secondary font-medium">Collective Target</span>
                      <span className="font-bold text-primary">88h / 112h · 78%</span>
                    </div>
                    <div className="h-2 bg-[var(--bg-default)] rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: '78%' }} />
                    </div>
                  </div>

                  {/* Footer status */}
                  <div className="flex items-center justify-between mt-3 text-[11px] text-content-muted">
                    <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                      ✓ 3/4 completed today
                    </span>
                    <span className="text-content-secondary font-medium group-hover:text-primary transition-colors">
                      Enter Room →
                    </span>
                  </div>
                </div>

                {/* Room Card 2 */}
                <div
                  onClick={() => setShowTestRoom(true)}
                  className="bg-elevated border border-subtle rounded-[18px] p-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99] group opacity-85 hover:opacity-100"
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Lock size={13} className="text-content-muted" />
                        <h3 className="text-[14px] font-bold text-content-primary group-hover:text-primary transition-colors">
                          Deep Work Sprint
                        </h3>
                      </div>
                      <p className="text-[11px] text-content-muted mt-0.5">2 companions</p>
                    </div>
                    <span className="text-[10px] font-bold text-primary bg-primary-soft border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                      ⚡ 6h/day
                    </span>
                  </div>

                  <div className="space-y-1.5 mt-3 pt-3 border-t border-subtle">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-content-secondary font-medium">Collective Target</span>
                      <span className="font-bold text-primary">42h / 84h · 50%</span>
                    </div>
                    <div className="h-2 bg-[var(--bg-default)] rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: '50%' }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 text-[11px] text-content-muted">
                    <span className="text-content-secondary font-medium">
                      1/2 completed today
                    </span>
                    <span className="text-content-secondary font-medium group-hover:text-primary transition-colors">
                      Enter Room →
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <UserProfileSheet open={showTestProfile} onClose={() => setShowTestProfile(false)} />
      <SquadRoomSheet open={showTestRoom} onClose={() => setShowTestRoom(false)} />
    </div>
  );
}
