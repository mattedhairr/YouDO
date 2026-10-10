import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalNode, Task } from '../types';
import {
  buildMorningBriefingContent,
  calculateNextBriefingTime,
  DEFAULT_NOTIFICATION_PREFERENCES,
  extractBriefingData,
  getDaysRemaining,
  getDmNotificationId,
  getGoalEndDate,
  getNotificationPreferences,
  getRoomNotificationId,
  isMentioned,
  resetBriefingSchedulingGuard,
  saveNotificationPreferences,
  scheduleMorningBriefing,
  sendTestBriefingNotification,
  stringToNotificationId,
  dispatchAdminNotification,
  dismissAdminNotification,
  dispatchCommunityNotification,
  dismissCommunityNotification,
  type NotificationPreferences,
} from './notifications';
import { STORAGE_KEYS } from './storageKeys';

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

describe('notifications library', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  describe('preferences', () => {
    it('returns default preferences when none stored', () => {
      const prefs = getNotificationPreferences();
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(prefs.enabled).toBe(true);
      expect(prefs.morningBriefing.time).toBe('04:00');
    });

    it('persists and restores updated preferences cleanly', () => {
      const custom: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        morningBriefing: {
          ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
          time: '05:30',
          includeBacklog: false,
        },
        privateHub: {
          ...DEFAULT_NOTIFICATION_PREFERENCES.privateHub,
          roomMessages: 'mentions',
        },
      };

      saveNotificationPreferences(custom);
      const retrieved = getNotificationPreferences();
      expect(retrieved.morningBriefing.time).toBe('05:30');
      expect(retrieved.morningBriefing.includeBacklog).toBe(false);
      expect(retrieved.privateHub.roomMessages).toBe('mentions');
      expect(retrieved.enabled).toBe(true);
    });

    it('gracefully fills missing fields when stored JSON is partial', () => {
      localStorage.setItem(
        STORAGE_KEYS.notificationPrefs,
        JSON.stringify({ enabled: false }),
      );
      const retrieved = getNotificationPreferences();
      expect(retrieved.enabled).toBe(false);
      expect(retrieved.morningBriefing.time).toBe('04:00');
      expect(retrieved.privateHub.directMessages).toBe(true);
    });

    it('initializes and migrates public hub preferences cleanly', () => {
      const prefs = getNotificationPreferences();
      expect(prefs.publicHub.communityMessages).toBe(false);
      expect(prefs.publicHub.hashtagMentions).toBe(true);

      // Persist custom preferences
      saveNotificationPreferences({
        ...prefs,
        publicHub: { ...prefs.publicHub, communityMessages: true },
      });
      expect(getNotificationPreferences().publicHub.communityMessages).toBe(true);

      // Legacy string 'all' migrates to true
      localStorage.setItem(
        STORAGE_KEYS.notificationPrefs,
        JSON.stringify({ publicHub: { communityMessages: 'all' } }),
      );
      expect(getNotificationPreferences().publicHub.communityMessages).toBe(true);

      // Legacy string 'mentions' or 'off' migrates to false
      localStorage.setItem(
        STORAGE_KEYS.notificationPrefs,
        JSON.stringify({ publicHub: { communityMessages: 'mentions' } }),
      );
      expect(getNotificationPreferences().publicHub.communityMessages).toBe(false);
    });
  });

  describe('days remaining calculation', () => {
    it('computes positive days remaining for future dates', () => {
      expect(getDaysRemaining('2026-10-19', '2026-10-09')).toBe(10);
    });

    it('computes 0 for today', () => {
      expect(getDaysRemaining('2026-10-09', '2026-10-09')).toBe(0);
    });

    it('computes negative days for overdue dates', () => {
      expect(getDaysRemaining('2026-10-05', '2026-10-09')).toBe(-4);
    });
  });

  describe('deterministic notification IDs', () => {
    it('generates reproducible positive integers within range', () => {
      const id1 = stringToNotificationId('dm:user_abc123');
      const id2 = stringToNotificationId('dm:user_abc123');
      const id3 = stringToNotificationId('dm:user_def456');

      expect(id1).toBe(id2);
      expect(id1).toBeGreaterThan(0);
      expect(id1).toBeLessThan(100000);
      expect(id1).not.toBe(id3);
    });

    it('distinguishes DM and Room ids for same identifier', () => {
      const dmId = getDmNotificationId('room-123');
      const roomId = getRoomNotificationId('room-123');
      expect(dmId).not.toBe(roomId);
    });
  });

  describe('mention matching', () => {
    it('detects @username mentions accurately', () => {
      expect(isMentioned('Hey @rahul can you check this?', 'rahul')).toBe(true);
      expect(isMentioned('Hey @rahul can you check this?', '@rahul')).toBe(true);
      expect(isMentioned('Hey @rahul_v2 check this', 'rahul')).toBe(false);
      expect(isMentioned('No mentions here', 'rahul')).toBe(false);
    });

    it('detects broadcast mentions like @all and @squad', () => {
      expect(isMentioned('@all meeting in 5 minutes', 'anybody')).toBe(true);
      expect(isMentioned('Check in @squad please', 'anybody')).toBe(true);
      expect(isMentioned('@room team standup', 'anybody')).toBe(true);
    });
  });

  describe('morning briefing content extraction and generation', () => {
    const mockTasks: Task[] = [
      {
        id: 't1',
        title: 'Review Chapter 4',
        description: '',
        priority: 'high',
        targetDate: '2026-10-09',
        deadline: null,
        steps: ['Read', 'Notes'],
        progress: 0,
        createdAt: 1,
        order: 1,
      },
      {
        id: 't2',
        title: 'Practice mock test',
        description: '',
        priority: 'medium',
        targetDate: '2026-10-09',
        deadline: null,
        steps: [],
        progress: 1, // complete
        createdAt: 2,
        order: 2,
      },
      {
        id: 't3',
        title: 'Backlog essay writing',
        description: '',
        priority: 'high',
        targetDate: '2026-10-07', // past date -> backlog
        deadline: null,
        steps: [],
        progress: 0,
        createdAt: 3,
        order: 3,
      },
    ];

    const mockGoals: GoalNode[] = [
      {
        id: 'g1',
        kind: 'goal',
        title: 'UPSC CSE Prelims',
        startDate: '2026-01-01',
        endDate: '2026-10-23', // 14 days left from 2026-10-09
        children: [],
        completed: false,
        createdAt: 10,
      },
      {
        id: 'g2',
        kind: 'goal',
        title: 'Completed Goal',
        endDate: '2026-10-10',
        children: [],
        completed: true,
        createdAt: 11,
      },
    ];

    it('extracts briefing data accurately with today tasks, backlog, and active goals', () => {
      const data = extractBriefingData(mockTasks, mockGoals, 7, 10, '2026-10-09');
      expect(data.todayTasksCount).toBe(1); // t1 is incomplete, t2 is complete
      expect(data.openBacklogCount).toBe(1); // t3 is backlog
      expect(data.activeGoals).toHaveLength(1);
      expect(data.activeGoals[0].title).toBe('UPSC CSE Prelims');
      expect(data.activeGoals[0].daysLeft).toBe(14);
      expect(data.streakCount).toBe(7);
    });

    it('builds informative morning briefing including goal countdown, today plan, and backlog', () => {
      const data = extractBriefingData(mockTasks, mockGoals, 5, 8, '2026-10-09');
      const { title, body } = buildMorningBriefingContent(data);

      expect(title).toContain('Good morning');
      expect(body).toContain('🎯 UPSC CSE Prelims (14 days left)');
      expect(body).toContain('📋 1 task scheduled for today');
      expect(body).toContain('⚠️ 1 uncompleted task in backlog');
      expect(body).toContain('🔥 5-day streak');
    });

    it('respects sub-toggles to omit specific sections if user turns them off', () => {
      const data = extractBriefingData(mockTasks, mockGoals, 5, 8, '2026-10-09');
      const { body } = buildMorningBriefingContent(data, {
        enabled: true,
        time: '04:00',
        includeGoals: false,
        includeTodayPlan: true,
        includeBacklog: false,
        includeStreak: false,
      });

      expect(body).not.toContain('UPSC CSE Prelims');
      expect(body).not.toContain('backlog');
      expect(body).not.toContain('streak');
      expect(body).toContain('1 task scheduled for today');
    });
    it('includes largeBody and summaryText for clean Android expansion without clipping', () => {
      const data = extractBriefingData(mockTasks, mockGoals, 5, 8, '2026-10-09');
      const content = buildMorningBriefingContent(data);
      expect(content.largeBody).toBeDefined();
      expect(content.largeBody).toBe(content.body);
      expect(content.summaryText).toBe('Daily Morning Briefing');
      expect(content.body).not.toContain(' \n'); // ensures clean \n without trailing space
    });

    it('only considers root/top-level goals in the hierarchy and ignores child sub-nodes with earlier deadlines', () => {
      const goalsWithChildren: GoalNode[] = [
        {
          id: 'root-1',
          kind: 'goal',
          title: 'Main UPSC Exam',
          startDate: '2026-01-01',
          endDate: '2026-10-29', // 20 days left from 2026-10-09
          completed: false,
          createdAt: 10,
          children: [
            {
              id: 'child-1',
              kind: 'node',
              title: 'Sub-chapter 1 Milestone',
              endDate: '2026-10-14', // 5 days left from 2026-10-09
              completed: false,
              createdAt: 12,
              children: [
                {
                  id: 'grandchild-1',
                  kind: 'node',
                  title: 'Deep child task',
                  endDate: '2026-10-10', // 1 day left
                  completed: false,
                  createdAt: 14,
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const data = extractBriefingData([], goalsWithChildren, 0, 0, '2026-10-09');
      // activeGoals MUST contain only root-1, NOT child-1 or grandchild-1
      expect(data.activeGoals).toHaveLength(1);
      expect(data.activeGoals[0].id).toBe('root-1');
      expect(data.activeGoals[0].title).toBe('Main UPSC Exam');
      expect(data.activeGoals[0].daysLeft).toBe(20);

      const content = buildMorningBriefingContent(data);
      expect(content.body).toContain('🎯 Main UPSC Exam (20 days left)');
      expect(content.body).not.toContain('Sub-chapter 1 Milestone');
      expect(content.body).not.toContain('Deep child task');
    });

    it('features the user-selected root goal when multiple root goals exist', () => {
      const multipleRootGoals: GoalNode[] = [
        {
          id: 'goal-alpha',
          kind: 'goal',
          title: 'Goal Alpha (Near Deadline)',
          endDate: '2026-10-12', // 3 days left
          completed: false,
          createdAt: 1,
          children: [],
        },
        {
          id: 'goal-beta',
          kind: 'goal',
          title: 'Goal Beta (Selected Goal)',
          endDate: '2026-10-24', // 15 days left
          completed: false,
          createdAt: 2,
          children: [],
        },
        {
          id: 'goal-gamma',
          kind: 'goal',
          title: 'Goal Gamma (Far Deadline)',
          endDate: '2026-11-09', // 31 days left
          completed: false,
          createdAt: 3,
          children: [],
        },
      ];

      // Default / 'auto' should pick nearest deadline (Goal Alpha)
      const dataAuto = extractBriefingData([], multipleRootGoals, 0, 0, '2026-10-09', 'auto');
      expect(dataAuto.activeGoals[0].id).toBe('goal-alpha');
      const contentAuto = buildMorningBriefingContent(dataAuto, {
        ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
        selectedGoalId: 'auto',
      });
      expect(contentAuto.body).toContain('🎯 Goal Alpha (Near Deadline) (3 days left)');

      // Explicit selection: Goal Beta
      const dataSelected = extractBriefingData([], multipleRootGoals, 0, 0, '2026-10-09', 'goal-beta');
      expect(dataSelected.activeGoals[0].id).toBe('goal-beta');
      const contentSelected = buildMorningBriefingContent(dataSelected, {
        ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
        selectedGoalId: 'goal-beta',
      });
      expect(contentSelected.body).toContain('🎯 Goal Beta (Selected Goal) (15 days left)');
      expect(contentSelected.body).not.toContain('Goal Alpha');

      // Fallback: if selected goal is invalid or missing, falls back to nearest deadline
      const dataFallback = extractBriefingData([], multipleRootGoals, 0, 0, '2026-10-09', 'nonexistent-id');
      expect(dataFallback.activeGoals[0].id).toBe('goal-alpha');
      const contentFallback = buildMorningBriefingContent(dataFallback, {
        ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
        selectedGoalId: 'nonexistent-id',
      });
      expect(contentFallback.body).toContain('🎯 Goal Alpha (Near Deadline) (3 days left)');
    });

    it('resolves root goal endDate from child milestone if root has no explicit endDate', () => {
      const rootWithoutEndDate: GoalNode[] = [
        {
          id: 'goal-milestones',
          kind: 'goal',
          title: 'Chartered Financial Analyst Exam',
          completed: false,
          createdAt: 1,
          children: [
            {
              id: 'phase-1',
              kind: 'node',
              title: 'Level 1 Milestone',
              endDate: '2026-10-19', // 10 days left
              completed: false,
              createdAt: 2,
              children: [],
            },
            {
              id: 'phase-2',
              kind: 'node',
              title: 'Final Examination Milestone',
              endDate: '2026-11-09', // 31 days left (latest milestone)
              completed: false,
              createdAt: 3,
              children: [],
            },
          ],
        },
      ];

      expect(getGoalEndDate(rootWithoutEndDate[0])).toBe('2026-11-09');

      const data = extractBriefingData([], rootWithoutEndDate, 0, 0, '2026-10-09');
      expect(data.activeGoals).toHaveLength(1);
      expect(data.activeGoals[0].id).toBe('goal-milestones');
      expect(data.activeGoals[0].title).toBe('Chartered Financial Analyst Exam');
      expect(data.activeGoals[0].daysLeft).toBe(31);

      const content = buildMorningBriefingContent(data);
      expect(content.body).toContain('🎯 Chartered Financial Analyst Exam (31 days left)');
      expect(content.body).not.toContain('Level 1 Milestone');
      expect(content.body).not.toContain('Final Examination Milestone');
    });

    it('features an active root goal without deadline when explicitly selected by the user', () => {
      const mixedGoals: GoalNode[] = [
        {
          id: 'goal-dated',
          kind: 'goal',
          title: 'Dated Target',
          endDate: '2026-10-15',
          completed: false,
          createdAt: 1,
          children: [],
        },
        {
          id: 'goal-open',
          kind: 'goal',
          title: 'Continuous Habit Mastery',
          completed: false,
          createdAt: 2,
          children: [],
        },
      ];

      const data = extractBriefingData([], mixedGoals, 0, 0, '2026-10-09', 'goal-open');
      expect(data.activeGoals[0].id).toBe('goal-open');
      const content = buildMorningBriefingContent(data, {
        ...DEFAULT_NOTIFICATION_PREFERENCES.morningBriefing,
        selectedGoalId: 'goal-open',
      });
      expect(content.body).toContain('🎯 Continuous Habit Mastery (In progress)');
      expect(content.body).not.toContain('Dated Target');
    });
  });

  describe('briefing scheduling time computation', () => {
    it('schedules for today if target time is in the future today', () => {
      const from = new Date('2026-10-09T03:30:00');
      const target = calculateNextBriefingTime('04:00', from);
      expect(target.getFullYear()).toBe(2026);
      expect(target.getMonth()).toBe(9); // 0-indexed October
      expect(target.getDate()).toBe(9);
      expect(target.getHours()).toBe(4);
      expect(target.getMinutes()).toBe(0);
    });

    it('schedules for tomorrow if target time has already passed today', () => {
      const from = new Date('2026-10-09T05:30:00');
      const target = calculateNextBriefingTime('04:00', from);
      expect(target.getFullYear()).toBe(2026);
      expect(target.getMonth()).toBe(9);
      expect(target.getDate()).toBe(10); // tomorrow
      expect(target.getHours()).toBe(4);
      expect(target.getMinutes()).toBe(0);
    });

    it('correctly handles midnight 00:00 and 00:30 without defaulting to 4 AM', () => {
      const fromEarly = new Date('2026-10-09T00:10:00');
      const targetMidnightLater = calculateNextBriefingTime('00:30', fromEarly);
      expect(targetMidnightLater.getDate()).toBe(9);
      expect(targetMidnightLater.getHours()).toBe(0);
      expect(targetMidnightLater.getMinutes()).toBe(30);

      const targetMidnightPassed = calculateNextBriefingTime('00:00', fromEarly);
      expect(targetMidnightPassed.getDate()).toBe(10); // tomorrow
      expect(targetMidnightPassed.getHours()).toBe(0);
      expect(targetMidnightPassed.getMinutes()).toBe(0);
    });
  });

  describe('test briefing notification and scheduling guards', () => {
    beforeEach(() => {
      resetBriefingSchedulingGuard();
    });

    it('dispatches test briefing notification and returns success status', async () => {
      const success = await sendTestBriefingNotification();
      // In Node test environment without window.Notification or Capacitor native, returns false safely
      expect(typeof success).toBe('boolean');
    });

    it('guards against unnecessary rescheduling when fingerprint is identical', async () => {
      // Scheduling with identical inputs returns without error
      await scheduleMorningBriefing([], []);
      await scheduleMorningBriefing([], []);
      resetBriefingSchedulingGuard();
    });
  });

  describe('admin hub notifications', () => {
    it('initializes default admin hub preferences correctly', () => {
      const prefs = getNotificationPreferences();
      expect(prefs.adminHub).toBeDefined();
      expect(prefs.adminHub?.enabled).toBe(true);
      expect(prefs.adminHub?.newHashtagRequests).toBe(true);
      expect(prefs.adminHub?.reportedMessages).toBe(true);
      expect(prefs.adminHub?.chatReplies).toBe(true);
    });

    it('persists and retrieves custom admin hub preferences', () => {
      const custom: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        adminHub: {
          enabled: true,
          newHashtagRequests: false,
          reportedMessages: true,
          chatReplies: false,
        },
      };
      saveNotificationPreferences(custom);
      const retrieved = getNotificationPreferences();
      expect(retrieved.adminHub?.newHashtagRequests).toBe(false);
      expect(retrieved.adminHub?.reportedMessages).toBe(true);
      expect(retrieved.adminHub?.chatReplies).toBe(false);
    });

    it('safely invokes dispatchAdminNotification and dismissAdminNotification', async () => {
      await expect(
        dispatchAdminNotification({
          type: 'hashtag_request',
          title: 'New Hashtag Request',
          body: '#GATE was requested by a student.',
          tagId: 'req_123',
        }),
      ).resolves.toBeUndefined();

      await expect(
        dispatchAdminNotification({
          type: 'message_report',
          title: 'Reported Message',
          body: 'A message was flagged for review.',
        }),
      ).resolves.toBeUndefined();

      await expect(
        dispatchAdminNotification({
          type: 'chat_reply',
          title: 'Support Reply',
          body: 'Requester replied with syllabus details.',
          tagId: 'req_123',
        }),
      ).resolves.toBeUndefined();

      await expect(dismissAdminNotification('req_123')).resolves.toBeUndefined();
    });
  });

  describe('community notifications', () => {
    it('safely dispatches and dismisses community notifications in test environment', async () => {
      await expect(
        dispatchCommunityNotification({
          senderName: 'Friend',
          content: 'Hello general chat!',
        }),
      ).resolves.toBeUndefined();

      await expect(
        dispatchCommunityNotification({
          senderName: 'StudyBuddy',
          content: 'Exam tip!',
          hashtag: 'gate',
          myHashtag: 'gate',
        }),
      ).resolves.toBeUndefined();

      await expect(dismissCommunityNotification()).resolves.toBeUndefined();
    });
  });
});

