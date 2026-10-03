import { useState } from 'react';
import { Bell, UserPlus, UsersRound } from 'lucide-react';
import BoardView from './BoardView';
import UserProfileSheet from './UserProfileSheet';

export default function HubView({ onOpenBoardSettings }: { onOpenBoardSettings: () => void }) {
  const [activeTab, setActiveTab] = useState<'social' | 'private'>('social');
  const [privateSubTab, setPrivateSubTab] = useState<'dms' | 'rooms'>('dms');
  const [showTestProfile, setShowTestProfile] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Master Toggle */}
      <div className="px-4 py-2 sticky top-0 z-10 bg-[var(--bg-default)]">
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
          <div className="px-4 py-2">
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

            {/* Private Content Placeholder */}
            {privateSubTab === 'dms' ? (
              <div className="text-center py-12 flex flex-col items-center">
                <p className="text-[14px] font-semibold text-content-primary">Direct Messages</p>
                <p className="text-[12px] text-content-muted mt-1.5 mb-6">Your friends and chats will appear here.</p>
                <button 
                  onClick={() => setShowTestProfile(true)}
                  className="px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-[12px] text-[13px] font-semibold hover:bg-primary/20 transition-colors"
                >
                  Test Sample Profile
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-[14px] font-semibold text-content-primary">Study Squads</p>
                <p className="text-[12px] text-content-muted mt-1.5">Join or create private accountability rooms.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <UserProfileSheet open={showTestProfile} onClose={() => setShowTestProfile(false)} />
    </div>
  );
}
