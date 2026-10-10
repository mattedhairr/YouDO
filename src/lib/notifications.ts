import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { GoalNode, Task } from '../types';
import { todayISO } from './dates';
import { isBacklogTask, isOpenBacklogTask, isTaskComplete } from './goalTree';
import { STORAGE_KEYS } from './storageKeys';

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
  };
  publicHub: {
    enabled: boolean;
    communityMessages: boolean;
    hashtagMentions: boolean;
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
    roomMessages: 'all',
  },
  publicHub: {
    enabled: true,
    communityMessages: false,
    hashtagMentions: true,
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
      privateHub: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.privateHub,
        ...(parsed.privateHub ?? {}),
      },
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

export function getDaysRemaining(endDate: string, today = todayISO()): number {
  const [ey, em, ed] = endDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const endUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((endUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the deadline for a root goal. If node.endDate is set, it takes precedence.
 * Otherwise, checks descendant nodes for the latest uncompleted deadline.
 */
export function getGoalEndDate(node: GoalNode): string | undefined {
  if (node.endDate) return node.endDate;
  let latestEnd: string | undefined;
  const walk = (children: GoalNode[]) => {
    for (const child of children) {
      if (!child.completed && child.endDate) {
        if (!latestEnd || child.endDate > latestEnd) {
          latestEnd = child.endDate;
        }
      }
      if (child.children?.length) {
        walk(child.children);
      }
    }
  };
  if (node.children?.length) {
    walk(node.children);
  }
  return latestEnd;
}

export interface BriefingData {
  todayTasksCount: number;
  openBacklogCount: number;
  activeGoals: { id: string; title: string; daysLeft: number }[];
  streakCount: number;
  streakBest: number;
}

export function extractBriefingData(
  tasks: Task[],
  goals: GoalNode[],
  streakCount = 0,
  streakBest = 0,
  today = todayISO(),
  selectedGoalId?: string,
): BriefingData {
  const todayTasks = tasks.filter((t) => (t.targetDate ? t.targetDate.slice(0, 10) === today : false) && !isBacklogTask(t, today) && !isTaskComplete(t));
  const openBacklog = tasks.filter((t) => isOpenBacklogTask(t, today));

  const activeGoals: { id: string; title: string; daysLeft: number }[] = [];
  // Only consider root/top-level goals in the hierarchy (i.e. top-level goals in the goal tree, not child sub-nodes)
  for (const node of goals) {
    if (!node.completed) {
      const endDate = getGoalEndDate(node);
      if (endDate) {
        const daysLeft = getDaysRemaining(endDate, today);
        activeGoals.push({ id: node.id, title: node.title, daysLeft });
      } else if (selectedGoalId && node.id === selectedGoalId) {
        // User explicitly chose this goal, preserve it even if no deadline is specified
        activeGoals.push({ id: node.id, title: node.title, daysLeft: Number.NaN });
      }
    }
  }

  activeGoals.sort((a, b) => {
    if (Number.isNaN(a.daysLeft)) return 1;
    if (Number.isNaN(b.daysLeft)) return -1;
    return a.daysLeft - b.daysLeft;
  });

  if (selectedGoalId && selectedGoalId !== 'auto') {
    const selectedIdx = activeGoals.findIndex((g) => g.id === selectedGoalId);
    if (selectedIdx > -1) {
      const [selected] = activeGoals.splice(selectedIdx, 1);
      activeGoals.unshift(selected);
    }
  }

  return {
    todayTasksCount: todayTasks.length,
    openBacklogCount: openBacklog.length,
    activeGoals,
    streakCount,
    streakBest,
  };
}

export function buildMorningBriefingContent(
  data: BriefingData,
  prefs = getNotificationPreferences().morningBriefing,
): { title: string; body: string; largeBody?: string; summaryText?: string } {
  const parts: string[] = [];

  // Goal countdown
  if (prefs.includeGoals && data.activeGoals.length > 0) {
    const selectedId = prefs.selectedGoalId;
    const topGoal =
      selectedId && selectedId !== 'auto'
        ? (data.activeGoals.find((g) => g.id === selectedId) ?? data.activeGoals[0])
        : data.activeGoals[0];

    if (topGoal) {
      if (Number.isNaN(topGoal.daysLeft)) {
        parts.push(`🎯 ${topGoal.title} (In progress)`);
      } else if (topGoal.daysLeft > 1) {
        parts.push(`🎯 ${topGoal.title} (${topGoal.daysLeft} days left)`);
      } else if (topGoal.daysLeft === 1) {
        parts.push(`🎯 ${topGoal.title} (Deadline tomorrow!)`);
      } else if (topGoal.daysLeft === 0) {
        parts.push(`🎯 ${topGoal.title} (Due today!)`);
      } else {
        parts.push(`🎯 ${topGoal.title} (${Math.abs(topGoal.daysLeft)}d overdue)`);
      }
    }
  }

  // Today's planned tasks
  if (prefs.includeTodayPlan) {
    if (data.todayTasksCount > 0) {
      parts.push(`📋 ${data.todayTasksCount} task${data.todayTasksCount === 1 ? '' : 's'} scheduled for today`);
    } else {
      parts.push(`📋 No tasks scheduled yet · Time to plan!`);
    }
  }

  // Backlog tasks
  if (prefs.includeBacklog && data.openBacklogCount > 0) {
    parts.push(`⚠️ ${data.openBacklogCount} uncompleted task${data.openBacklogCount === 1 ? '' : 's'} in backlog`);
  }

  // Streak status
  if (prefs.includeStreak && data.streakCount > 0) {
    parts.push(`🔥 ${data.streakCount}-day streak · Keep it burning!`);
  }

  const title = '🌅 Good morning! Daily Focus Briefing';
  const fullText = parts.length > 0 ? parts.join('\n') : 'Ready to conquer today? Open YouDO to review your targets.';
  const body = fullText;
  const largeBody = fullText;
  const summaryText = 'Daily Morning Briefing';

  return { title, body, largeBody, summaryText };
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
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.morningBriefing.enabled) {
    if (lastScheduledBriefingFingerprint !== null) {
      lastScheduledBriefingFingerprint = null;
      await cancelNotification(NOTIFICATION_IDS.MORNING_BRIEFING);
    }
    return;
  }

  const data = extractBriefingData(tasks, goals, streakCount, streakBest, todayISO(), prefs.morningBriefing.selectedGoalId);
  const { title, body, largeBody, summaryText } = buildMorningBriefingContent(data, prefs.morningBriefing);
  const nextAt = calculateNextBriefingTime(prefs.morningBriefing.time);
  const fingerprint = `${prefs.morningBriefing.time}|${prefs.morningBriefing.selectedGoalId ?? 'auto'}|${nextAt.getTime()}|${title}|${body}`;

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
            schedule: {
              at: nextAt,
              allowWhileIdle: true,
              repeats: true,
              every: 'day',
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

export async function sendTestBriefingNotification(
  content?: { title: string; body: string; largeBody?: string; summaryText?: string },
): Promise<boolean> {
  const briefingContent = content ?? buildMorningBriefingContent(
    extractBriefingData([], []),
  );

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
            summaryText: briefingContent.summaryText || 'Daily Morning Briefing',
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

  const isHashtagMatch =
    Boolean(prefs.publicHub.hashtagMentions && params.hashtag && params.myHashtag && params.hashtag.toLowerCase() === params.myHashtag.toLowerCase());

  if (!prefs.publicHub.communityMessages && !isHashtagMatch) return;

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

