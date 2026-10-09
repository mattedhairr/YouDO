import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMorningBriefingContent,
  dismissCommunityNotification,
  dismissDmNotification,
  dismissFriendRequestNotification,
  dismissRoomInviteNotification,
  dismissRoomNotification,
  dispatchCommunityNotification,
  dispatchDmNotification,
  dispatchFriendRequestNotification,
  dispatchRoomInviteNotification,
  dispatchRoomNotification,
  extractBriefingData,
  getDmNotificationId,
  getNotificationPreferences,
  getRoomNotificationId,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../src/lib/notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { GoalNode, Task } from '../src/types';

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    createChannel: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue(undefined),
    removeDeliveredNotifications: vi.fn().mockResolvedValue(undefined),
    removeAllDeliveredNotifications: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

describe('Notification Integration & Read-State Synchronization', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.clearAllMocks();
  });

  describe('Direct Messages', () => {
    it('dispatches notification when enabled', async () => {
      await dispatchDmNotification({
        friendId: 'user-456',
        friendName: 'Alex',
        content: 'Hey, are you free to study?',
      });

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
      const callArgs = (LocalNotifications.schedule as any).mock.calls[0][0];
      expect(callArgs.notifications[0].id).toBe(getDmNotificationId('user-456'));
      expect(callArgs.notifications[0].title).toBe('Alex');
      expect(callArgs.notifications[0].body).toBe('Hey, are you free to study?');
      expect(callArgs.notifications[0].channelId).toBe(NOTIFICATION_CHANNELS.PRIVATE_HUB);
    });

    it('does not dispatch DM notification if user toggles DMs off', async () => {
      const prefs: NotificationPreferences = {
        ...getNotificationPreferences(),
        privateHub: {
          ...getNotificationPreferences().privateHub,
          directMessages: false,
        },
      };
      saveNotificationPreferences(prefs);

      await dispatchDmNotification({
        friendId: 'user-456',
        friendName: 'Alex',
        content: 'Hey!',
      });

      expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    });

    it('dismisses DM notification when thread is marked read or viewed', async () => {
      await dismissDmNotification('user-456');

      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: getDmNotificationId('user-456') }],
      });
      expect(LocalNotifications.removeDeliveredNotifications).toHaveBeenCalled();
    });
  });

  describe('Room Chat Anti-Spam & Notifications', () => {
    it('suppresses regular room messages when roomMessages is set to "mentions"', async () => {
      const prefs: NotificationPreferences = {
        ...getNotificationPreferences(),
        privateHub: {
          ...getNotificationPreferences().privateHub,
          roomMessages: 'mentions',
        },
      };
      saveNotificationPreferences(prefs);

      await dispatchRoomNotification({
        squadId: 'squad-101',
        squadName: 'Study Group A',
        senderName: 'Bob',
        content: 'Just finished my morning reading.',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    });

    it('alerts user when mentioned in room chat under "mentions" mode', async () => {
      const prefs: NotificationPreferences = {
        ...getNotificationPreferences(),
        privateHub: {
          ...getNotificationPreferences().privateHub,
          roomMessages: 'mentions',
        },
      };
      saveNotificationPreferences(prefs);

      await dispatchRoomNotification({
        squadId: 'squad-101',
        squadName: 'Study Group A',
        senderName: 'Bob',
        content: 'Hey @rahul did you solve question 5?',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
      const callArgs = (LocalNotifications.schedule as any).mock.calls[0][0];
      expect(callArgs.notifications[0].id).toBe(getRoomNotificationId('squad-101'));
      expect(callArgs.notifications[0].title).toBe('Room: Study Group A');
      expect(callArgs.notifications[0].body).toContain('Bob: Hey @rahul did you solve question 5?');
    });

    it('alerts on broadcast tags like @all or @squad', async () => {
      const prefs: NotificationPreferences = {
        ...getNotificationPreferences(),
        privateHub: {
          ...getNotificationPreferences().privateHub,
          roomMessages: 'mentions',
        },
      };
      saveNotificationPreferences(prefs);

      await dispatchRoomNotification({
        squadId: 'squad-101',
        squadName: 'Study Group A',
        senderName: 'Bob',
        content: '@squad meeting starting now',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    });

    it('alerts on all room messages when mode is "all"', async () => {
      const prefs: NotificationPreferences = {
        ...getNotificationPreferences(),
        privateHub: {
          ...getNotificationPreferences().privateHub,
          roomMessages: 'all',
        },
      };
      saveNotificationPreferences(prefs);

      await dispatchRoomNotification({
        squadId: 'squad-101',
        squadName: 'Study Group A',
        senderName: 'Bob',
        content: 'Quiet checkin.',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    });

    it('dismisses room notification when user opens or reads the room chat', async () => {
      await dismissRoomNotification('squad-101');

      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: getRoomNotificationId('squad-101') }],
      });
    });
  });

  describe('Public Hub & Community Anti-Spam', () => {
    it('defaults to mentions only for community messages to prevent spam flooding', async () => {
      expect(getNotificationPreferences().publicHub.communityMessages).toBe('mentions');

      await dispatchCommunityNotification({
        senderName: 'Stranger',
        content: 'Hello everyone in public chat!',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    });

    it('alerts when someone tags the user in community chat', async () => {
      await dispatchCommunityNotification({
        senderName: 'Friend',
        content: 'Shoutout to @rahul for the great notes!',
        myUsername: 'rahul',
      });

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
      const callArgs = (LocalNotifications.schedule as any).mock.calls[0][0];
      expect(callArgs.notifications[0].id).toBe(NOTIFICATION_IDS.COMMUNITY);
    });

    it('dismisses community notification upon reading community chat', async () => {
      await dismissCommunityNotification();

      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: NOTIFICATION_IDS.COMMUNITY }],
      });
    });
  });

  describe('Friend Requests & Room Invites', () => {
    it('dispatches friend request notification and dismisses on view', async () => {
      await dispatchFriendRequestNotification('Priya');
      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
      const callArgs = (LocalNotifications.schedule as any).mock.calls[0][0];
      expect(callArgs.notifications[0].id).toBe(NOTIFICATION_IDS.FRIEND_REQUEST);

      await dismissFriendRequestNotification();
      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: NOTIFICATION_IDS.FRIEND_REQUEST }],
      });
    });

    it('dispatches room invite notification and dismisses on view', async () => {
      await dispatchRoomInviteNotification('Focus Squad', 'Vikram');
      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
      const callArgs = (LocalNotifications.schedule as any).mock.calls[0][0];
      expect(callArgs.notifications[0].id).toBe(NOTIFICATION_IDS.ROOM_INVITE);

      await dismissRoomInviteNotification();
      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: NOTIFICATION_IDS.ROOM_INVITE }],
      });
    });
  });

  describe('Comprehensive Morning Briefing Generator', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Complete Algebra Module',
        description: '',
        priority: 'high',
        targetDate: '2026-10-09',
        deadline: null,
        steps: ['Theory', 'Problems'],
        progress: 0,
        createdAt: 1,
        order: 1,
      },
      {
        id: 't2',
        title: 'Overdue Essay Review',
        description: '',
        priority: 'high',
        targetDate: '2026-10-06', // Backlog
        deadline: null,
        steps: [],
        progress: 0,
        createdAt: 2,
        order: 2,
      },
      {
        id: 't3',
        title: 'Overdue Flashcards',
        description: '',
        priority: 'medium',
        targetDate: '2026-10-07', // Backlog
        deadline: null,
        steps: [],
        progress: 0,
        createdAt: 3,
        order: 3,
      },
    ];

    const goals: GoalNode[] = [
      {
        id: 'g1',
        kind: 'goal',
        title: 'State PSC Exam',
        endDate: '2026-10-24', // 15 days left
        children: [],
        completed: false,
        createdAt: 10,
      },
    ];

    it('generates high-signal lockscreen briefing with all core elements', () => {
      const data = extractBriefingData(tasks, goals, 12, 15, '2026-10-09');
      const { title, body } = buildMorningBriefingContent(data);

      expect(title).toContain('Good morning');
      expect(body).toContain('🎯 State PSC Exam (15 days left)');
      expect(body).toContain('📋 1 task scheduled for today');
      expect(body).toContain('⚠️ 2 uncompleted tasks in backlog');
      expect(body).toContain('🔥 12-day streak');
    });
  });
});
