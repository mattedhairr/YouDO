import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { GoalNode, Task } from '../types';
import { localISODate } from './dates';
import { readStorageRaw, STORAGE_KEYS } from './storageKeys';
import { ACCENT_SWATCHES, resolveAccent } from './accentColors';

export type RoomNotificationMode = 'all' | 'mentions' | 'off';
export type CommunityNotificationMode = boolean;

export interface AdminHubNotificationPreferences {
  enabled: boolean;
  newHashtagRequests: boolean;
  reportedMessages: boolean;
  chatReplies: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  morningBriefing: {
    enabled: boolean;
    time: string; // '04:00' (24-hour format HH:mm)
    includeGoals: boolean;
    selectedGoalId?: string | 'auto';
    includeTodayPlan: boolean;
    includeBacklog: boolean;
    includeStreak: boolean;
  };
  privateHub: {
    enabled: boolean;
    directMessages: boolean;
    friendRequests: boolean;
    roomInvites: boolean;
    roomMessages: RoomNotificationMode;
    /** True once the person picked a room setting; older saves hold only the old default. */
    roomMessagesChosen?: boolean;
    /** Show the message text in direct message notifications. */
    messagePreviews?: boolean;
  };
  publicHub: {
    enabled: boolean;
    communityMessages: boolean;
    hashtagMentions: boolean;
    /** Push when an admin sends a Board update (server side, push_preferences.board_updates). */
    boardUpdates: boolean;
  };
  adminHub?: AdminHubNotificationPreferences;
  sound: boolean;
  vibrate: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  morningBriefing: {
    enabled: true,
    time: '04:00',
    includeGoals: true,
    selectedGoalId: 'auto',
    includeTodayPlan: true,
    includeBacklog: true,
    includeStreak: true,
  },
  privateHub: {
    enabled: true,
    directMessages: true,
    friendRequests: true,
    roomInvites: true,
    roomMessages: 'mentions',
    messagePreviews: true,
  },
  publicHub: {
    enabled: true,
    communityMessages: false,
    hashtagMentions: true,
    boardUpdates: true,
  },
  adminHub: {
    enabled: true,
    newHashtagRequests: true,
    reportedMessages: true,
    chatReplies: true,
  },
  sound: true,
  vibrate: true,
};

export const NOTIFICATION_CHANNELS = {
  DAILY_BRIEFING: 'daily-briefing',
  PRIVATE_HUB: 'private-hub',
  PUBLIC_HUB: 'public-hub',
  ADMIN_HUB: 'admin-hub',
} as const;

export const NOTIFICATION_IDS = {
  MORNING_BRIEFING: 1001,
  TEST_BRIEFING: 9999,
  FRIEND_REQUEST: 2001,
  ROOM_INVITE: 2002,
  COMMUNITY: 3001,
  ADMIN_HUB: 4001,
} as const;

export const NOTIFICATION_PREFS_CHANGED_EVENT = 'youdo:notification-prefs-changed';

/** Deterministic positive integer notification ID within safe 32-bit Android range */
export function stringToNotificationId(str: string, offset = 10000, range = 50000): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return offset + (Math.abs(hash) % range);
}

export function getDmNotificationId(friendId: string): number {
  return stringToNotificationId(`dm:${friendId}`, 10000, 20000);
}

export function getRoomNotificationId(squadId: string): number {
  return stringToNotificationId(`room:${squadId}`, 30000, 20000);
}

export function getNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.notificationPrefs);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_NOTIFICATION_PREFERENCES.enabled,
      morningBriefing: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
        ...(parsed.morningBriefing ?? {}),
        selectedGoalId:
          typeof parsed.morningBriefing?.selectedGoalId === 'string'
            ? parsed.morningBriefing.selectedGoalId
            : DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing.selectedGoalId,
      },
      privateHub: (() => {
        const hub = { ...DEFAULT_NOTIFICATION_PREFERENCES.privateHub, ...(parsed.privateHub ?? {}) };
        // "All messages" used to be the default; only a real choice keeps it.
        if (hub.roomMessages === 'all' && !hub.roomMessagesChosen) hub.roomMessages = 'mentions';
        return hub;
      })(),
      publicHub: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.publicHub,
        ...(parsed.publicHub ?? {}),
        communityMessages:
          typeof parsed.publicHub?.communityMessages === 'boolean'
            ? parsed.publicHub.communityMessages
            : parsed.publicHub?.communityMessages === 'all'
              ? true
              : false,
      },
      adminHub: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.adminHub!,
        ...(parsed.adminHub ?? {}),
      },
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_NOTIFICATION_PREFERENCES.sound,
      vibrate: typeof parsed.vibrate === 'boolean' ? parsed.vibrate : DEFAULT_NOTIFICATION_PREFERENCES.vibrate,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.notificationPrefs, JSON.stringify(prefs));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFS_CHANGED_EVENT, { detail: prefs }));
    }
  } catch {
    /* storage quota ignore */
  }
}

export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'prompt';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }

  return 'denied';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch {
      return false;
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  return false;
}

let channelsConfigured = false;

export async function ensureNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform() || channelsConfigured) return;
  try {
    await Promise.all([
      LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.DAILY_BRIEFING,
        name: 'Daily Morning Briefing',
        description: 'Morning lockscreen summary of goals countdown, today plan, and backlog tasks.',
        importance: 3,
        visibility: 1,
        vibration: true,
      }),
      LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.PRIVATE_HUB,
        name: 'Private Hub (Direct & Room Chats)',
        description: 'Direct messages, room chats, friend requests, and invites.',
        importance: 4,
        visibility: 1,
        vibration: true,
      }),
      LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.PUBLIC_HUB,
        name: 'Public Hub & Community',
        description: 'Community chats, hashtag discussions, and public room alerts.',
        importance: 3,
        visibility: 0,
        vibration: true,
      }),
      LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.ADMIN_HUB,
        name: 'Community Admin Hub',
        description: 'Moderator alerts for hashtag requests, reports, and replies.',
        importance: 4,
        visibility: 1,
        vibration: true,
      }),
    ]);
    channelsConfigured = true;
  } catch (err) {
    console.warn('Could not register notification channels:', err);
  }
}

/** The accent tone Android tints the notification icon with. */
export function notificationAccentColor(): string | undefined {
  try {
    const raw = readStorageRaw(STORAGE_KEYS.theme);
    const theme = (raw ? JSON.parse(raw) : null) as { darkMode?: boolean; accent?: string } | null;
    const swatch = ACCENT_SWATCHES[resolveAccent(theme ?? {})];
    return theme?.darkMode === false ? swatch.light : swatch.dark;
  } catch {
    return undefined;
  }
}

export function calculateNextBriefingTime(timeStr: string, fromDate = new Date()): Date {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const parsedHour = Number(hoursStr);
  const parsedMinute = Number(minutesStr);
  const targetHour = Number.isFinite(parsedHour) && parsedHour >= 0 && parsedHour <= 23 ? parsedHour : 4;
  const targetMinute = Number.isFinite(parsedMinute) && parsedMinute >= 0 && parsedMinute <= 59 ? parsedMinute : 0;

  const next = new Date(fromDate.getTime());
  next.setHours(targetHour, targetMinute, 0, 0);

  // If the target time has already passed today, schedule for tomorrow
  if (next.getTime() <= fromDate.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

let lastScheduledBriefingFingerprint: string | null = null;
// The last real streak the app reported, so a settings change can reschedule
// without knowing the streak itself.
let lastKnownStreak = { count: 0, best: 0 };
let isSchedulingBriefing = false;
let pendingBriefingCall: {
  tasks: Task[];
  goals: GoalNode[];
  streakCount: number;
  streakBest: number;
  options?: { force?: boolean };
} | null = null;

export function resetBriefingSchedulingGuard(): void {
  lastScheduledBriefingFingerprint = null;
  isSchedulingBriefing = false;
  pendingBriefingCall = null;
}

export async function scheduleMorningBriefing(
  tasks: Task[],
  goals: GoalNode[],
  streakCount = 0,
  streakBest = 0,
  options?: { force?: boolean },
): Promise<void> {
  lastKnownStreak = { count: streakCount, best: streakBest };
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.morningBriefing.enabled) {
    if (lastScheduledBriefingFingerprint !== null) {
      lastScheduledBriefingFingerprint = null;
      await cancelNotification(NOTIFICATION_IDS.MORNING_BRIEFING);
    }
    return;
  }

  // The briefing is usually scheduled the evening before it is shown, so it
  // describes the delivery day: its days left, its tasks, its backlog.
  const nextAt = calculateNextBriefingTime(prefs.morningBriefing.time);
  const { extractBriefingData, buildMorningBriefingContent } = await import('./morningBriefing');
  const data = extractBriefingData(tasks, goals, streakCount, streakBest, localISODate(nextAt), prefs.morningBriefing.selectedGoalId);
  const { title, body, largeBody, summaryText } = buildMorningBriefingContent(data, prefs.morningBriefing);
  const iconColor = notificationAccentColor();
  const fingerprint = `${prefs.morningBriefing.time}|${prefs.morningBriefing.selectedGoalId ?? 'auto'}|${nextAt.getTime()}|${title}|${body}|${largeBody ?? ''}|${summaryText ?? ''}|${iconColor ?? ''}`;

  if (!options?.force && lastScheduledBriefingFingerprint === fingerprint) {
    return;
  }

  if (isSchedulingBriefing) {
    pendingBriefingCall = { tasks, goals, streakCount, streakBest, options };
    return;
  }
  isSchedulingBriefing = true;

  try {
    await ensureNotificationChannels();

    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({
        notifications: [{ id: NOTIFICATION_IDS.MORNING_BRIEFING }],
      });

      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_IDS.MORNING_BRIEFING,
            title,
            body,
            largeBody,
            summaryText,
            iconColor,
            schedule: {
              at: nextAt,
              allowWhileIdle: true,
            },
            channelId: NOTIFICATION_CHANNELS.DAILY_BRIEFING,
            extra: {
              type: 'morning_briefing',
              route: 'today',
            },
          },
        ],
      });
    }
    lastScheduledBriefingFingerprint = fingerprint;
  } catch (err) {
    console.warn('Failed to schedule native morning briefing:', err);
  } finally {
    isSchedulingBriefing = false;
    if (pendingBriefingCall) {
      const nextCall = pendingBriefingCall;
      pendingBriefingCall = null;
      void scheduleMorningBriefing(
        nextCall.tasks,
        nextCall.goals,
        nextCall.streakCount,
        nextCall.streakBest,
        nextCall.options,
      );
    }
  }
}

/** Reschedule after a briefing setting changed, keeping the last known streak. */
export function refreshMorningBriefing(tasks: Task[], goals: GoalNode[]): Promise<void> {
  return scheduleMorningBriefing(tasks, goals, lastKnownStreak.count, lastKnownStreak.best, { force: true });
}

export async function sendTestBriefingNotification(
  content?: { title: string; body: string; largeBody?: string; summaryText?: string },
): Promise<boolean> {
  const briefing = content ? null : await import('./morningBriefing');
  const briefingContent = content ?? briefing!.buildMorningBriefingContent(briefing!.extractBriefingData([], []));

  await ensureNotificationChannels();

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: NOTIFICATION_IDS.TEST_BRIEFING }],
      });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_IDS.TEST_BRIEFING,
            title: briefingContent.title,
            body: briefingContent.body,
            largeBody: briefingContent.largeBody || briefingContent.body,
            summaryText: briefingContent.summaryText || 'Morning briefing',
            iconColor: notificationAccentColor(),
            channelId: NOTIFICATION_CHANNELS.DAILY_BRIEFING,
            extra: {
              type: 'morning_briefing_test',
              route: 'today',
            },
          },
        ],
      });
      return true;
    } catch (err) {
      console.warn('Failed to dispatch native test briefing notification:', err);
      return false;
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(briefingContent.title, {
            body: briefingContent.body,
            icon: '/favicon.ico',
          });
          return true;
        }
      }
      new Notification(briefingContent.title, { body: briefingContent.body });
      return true;
    } catch (err) {
      console.warn('Failed to dispatch web test notification:', err);
      return false;
    }
  }

  return false;
}

export function isMentioned(text: string, username?: string | null): boolean {
  if (!text) return false;
  if (/@all\b|@everyone\b|@squad\b|@room\b/i.test(text)) return true;
  if (!username) return false;
  const cleanUsername = username.replace(/^@/, '');
  const pattern = new RegExp(`@${cleanUsername}\\b`, 'i');
  return pattern.test(text);
}

export async function dispatchDmNotification(params: {
  friendId: string;
  friendName: string;
  content: string;
}): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.privateHub.enabled || !prefs.privateHub.directMessages) return;

  const id = getDmNotificationId(params.friendId);
  const title = params.friendName || 'New Direct Message';
  const body = params.content.length > 120 ? `${params.content.slice(0, 117)}...` : params.content;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.PRIVATE_HUB,
            extra: {
              type: 'dm',
              friendId: params.friendId,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch native DM notification:', err);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: `dm:${params.friendId}`,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function dispatchRoomNotification(params: {
  squadId: string;
  squadName: string;
  senderName: string;
  content: string;
  myUsername?: string | null;
}): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.privateHub.enabled) return;
  if (prefs.privateHub.roomMessages === 'off') return;

  if (prefs.privateHub.roomMessages === 'mentions') {
    if (!isMentioned(params.content, params.myUsername)) return;
  }

  const id = getRoomNotificationId(params.squadId);
  const title = params.squadName ? `Room: ${params.squadName}` : 'Room Message';
  const prefix = params.senderName ? `${params.senderName}: ` : '';
  const text = `${prefix}${params.content}`;
  const body = text.length > 120 ? `${text.slice(0, 117)}...` : text;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.PRIVATE_HUB,
            extra: {
              type: 'room',
              squadId: params.squadId,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch room notification:', err);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: `room:${params.squadId}`,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function dispatchCommunityNotification(params: {
  senderName: string;
  content: string;
  hashtag?: string | null;
  myUsername?: string | null;
  myHashtag?: string | null;
}): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.publicHub.enabled) return;

  const isHashtagAlert = Boolean(
    prefs.publicHub.hashtagMentions &&
      params.hashtag &&
      (params.senderName === 'Hashtag Support' ||
        !params.myHashtag ||
        params.hashtag.toLowerCase() === params.myHashtag.toLowerCase()),
  );

  if (!prefs.publicHub.communityMessages && !isHashtagAlert) return;

  const id = NOTIFICATION_IDS.COMMUNITY;
  const title = params.hashtag ? `#${params.hashtag} Community` : 'Public Community';
  const prefix = params.senderName ? `${params.senderName}: ` : '';
  const text = `${prefix}${params.content}`;
  const body = text.length > 120 ? `${text.slice(0, 117)}...` : text;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.PUBLIC_HUB,
            extra: {
              type: 'community',
              hashtag: params.hashtag,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch community notification:', err);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: 'community:global',
      });
    } catch {
      /* ignore */
    }
  }
}

export async function dispatchFriendRequestNotification(requesterName: string): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.privateHub.enabled || !prefs.privateHub.friendRequests) return;

  const id = NOTIFICATION_IDS.FRIEND_REQUEST;
  const title = 'New Friend Request';
  const body = `${requesterName || 'Someone'} sent you a friend request on YouDO.`;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.PRIVATE_HUB,
            extra: { type: 'friend_request' },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch friend request notification:', err);
    }
  }
}

export async function dispatchRoomInviteNotification(squadName: string, inviterName: string): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.privateHub.enabled || !prefs.privateHub.roomInvites) return;

  const id = NOTIFICATION_IDS.ROOM_INVITE;
  const title = 'Room Invitation';
  const body = `${inviterName || 'A friend'} invited you to join "${squadName || 'a squad room'}".`;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.PRIVATE_HUB,
            extra: { type: 'room_invite' },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch room invite notification:', err);
    }
  }
}

export async function cancelNotification(id: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
      await LocalNotifications.removeDeliveredNotifications({
        notifications: [{ id, title: '', body: '' }],
      });
    } catch {
      /* ignore */
    }
  }
}

export async function dismissDmNotification(friendId: string): Promise<void> {
  const id = getDmNotificationId(friendId);
  await cancelNotification(id);
}

export async function dismissRoomNotification(squadId: string): Promise<void> {
  const id = getRoomNotificationId(squadId);
  await cancelNotification(id);
}

export async function dismissCommunityNotification(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.COMMUNITY);
}

export async function dismissFriendRequestNotification(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.FRIEND_REQUEST);
}

export async function dismissRoomInviteNotification(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.ROOM_INVITE);
}

export async function dismissAllHubNotifications(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.removeAllDeliveredNotifications();
    } catch {
      /* ignore */
    }
  }
}

export async function dispatchAdminNotification(params: {
  type: 'hashtag_request' | 'message_report' | 'chat_reply';
  title: string;
  body: string;
  tagId?: string;
}): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled) return;
  const adminPrefs = prefs.adminHub ?? DEFAULT_NOTIFICATION_PREFERENCES.adminHub!;
  if (!adminPrefs.enabled) return;

  if (params.type === 'hashtag_request' && !adminPrefs.newHashtagRequests) return;
  if (params.type === 'message_report' && !adminPrefs.reportedMessages) return;
  if (params.type === 'chat_reply' && !adminPrefs.chatReplies) return;

  const id = params.tagId
    ? stringToNotificationId(`admin:${params.tagId}`, 4000, 1000)
    : NOTIFICATION_IDS.ADMIN_HUB;

  const title = params.title || 'Admin Hub Alert';
  const body = params.body.length > 120 ? `${params.body.slice(0, 117)}...` : params.body;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: NOTIFICATION_CHANNELS.ADMIN_HUB,
            extra: {
              type: 'admin_hub',
              alertType: params.type,
              tagId: params.tagId,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to dispatch admin notification:', err);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: `admin:${params.type}:${params.tagId ?? 'general'}`,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function dismissAdminNotification(tagId?: string): Promise<void> {
  const id = tagId
    ? stringToNotificationId(`admin:${tagId}`, 4000, 1000)
    : NOTIFICATION_IDS.ADMIN_HUB;
  await cancelNotification(id);
}

