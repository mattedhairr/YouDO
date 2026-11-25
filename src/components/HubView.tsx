import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BoardView from './BoardView';
import type { PaceRow, PaceWindow } from '../lib/paceBoard';
import UserProfileSheet from './UserProfileSheet';
import HubAuthGate from './HubAuthGate';
import PrivateHubView from './PrivateHubView';
import { requestOpenDm } from './hub/openDm';

export default function HubView({
  onOpenBoardSettings,
  activeTab = 'social',
  personalPace,
  onSwitchToPrivate,
  onSwitchToPublic,
  pendingCount,
  refreshPendingCount,
  refreshDmInbox,
  refreshSquadChat,
  dmsTabAttention,
  roomsTabAttention,
}: {
  onOpenBoardSettings: () => void;
  activeTab?: 'social' | 'private';
  personalPace?: number;
  onSwitchToPrivate?: () => void;
  onSwitchToPublic?: () => void;
  pendingCount?: number;
  refreshPendingCount?: () => void;
  refreshDmInbox?: () => void;
  refreshSquadChat?: () => void;
  dmsTabAttention?: boolean;
  roomsTabAttention?: boolean;
}) {
  const { user } = useAuth();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileBoardPreview, setProfileBoardPreview] = useState<PaceRow | null>(null);
  const [profileBoardWindow, setProfileBoardWindow] = useState<PaceWindow>('week');
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!user) {
    return (
      <div className="w-full">
        <div key={activeTab} className="hub-screen-transition overflow-x-hidden">
          <HubAuthGate
            tab={activeTab}
            isOffline={!isOnline}
            onSwitchTab={(target) => {
              if (target === 'private') onSwitchToPrivate?.();
              else onSwitchToPublic?.();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div key={activeTab} className="hub-screen-transition overflow-x-hidden">
        {activeTab === 'social' ? (
          <BoardView
            onOpenBoardSettings={onOpenBoardSettings}
            onOpenProfile={(id, row, paceWindow) => {
              setProfileUserId(id);
              setProfileBoardPreview(row ?? null);
              if (paceWindow) setProfileBoardWindow(paceWindow);
            }}
            onMessage={(id) => {
              onSwitchToPrivate?.();
              requestOpenDm(id);
            }}
          />
        ) : (
          <PrivateHubView
            personalPace={personalPace}
            onSwitchToPublic={onSwitchToPublic}
            pendingCount={pendingCount}
            refreshPendingCount={refreshPendingCount}
            refreshDmInbox={refreshDmInbox}
            refreshSquadChat={refreshSquadChat}
            dmsTabAttention={dmsTabAttention}
            roomsTabAttention={roomsTabAttention}
          />
        )}
      </div>

      <UserProfileSheet
        userId={profileUserId}
        boardPreview={profileBoardPreview}
        boardPaceWindow={profileBoardWindow}
        onClose={() => {
          setProfileUserId(null);
          setProfileBoardPreview(null);
        }}
        onMessage={() => {
          const target = profileUserId;
          setProfileUserId(null);
          onSwitchToPrivate?.();
          if (target) requestOpenDm(target);
        }}
      />
    </div>
  );
}
