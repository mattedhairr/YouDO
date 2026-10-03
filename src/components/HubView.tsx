import { useState } from 'react';
import BoardView from './BoardView';

export default function HubView({ onOpenBoardSettings }: { onOpenBoardSettings: () => void }) {
  const [activeTab, setActiveTab] = useState<'social' | 'private'>('social');
  const [privateSubTab, setPrivateSubTab] = useState<'dms' | 'rooms'>('dms');

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
          <div className="px-4 py-4">
            {/* Private Sub-tabs */}
            <div className="flex gap-4 border-b border-subtle pb-2 mb-4">
              <button
                onClick={() => setPrivateSubTab('dms')}
                className={`text-sm font-semibold transition-colors ${
                  privateSubTab === 'dms' ? 'text-primary' : 'text-content-muted'
                }`}
              >
                DMs
              </button>
              <button
                onClick={() => setPrivateSubTab('rooms')}
                className={`text-sm font-semibold transition-colors ${
                  privateSubTab === 'rooms' ? 'text-primary' : 'text-content-muted'
                }`}
              >
                Rooms
              </button>
            </div>

            {/* Private Content Placeholder */}
            {privateSubTab === 'dms' ? (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-content-primary">Direct Messages</p>
                <p className="text-xs text-content-muted mt-1">Chat with your friends.</p>
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-content-primary">Study Squads</p>
                <p className="text-xs text-content-muted mt-1">Join private accountability rooms.</p>
              </div>
            )}
            
            {/* Action button */}
            <div className="fixed bottom-24 right-4 z-20">
              <button className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl">+</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
