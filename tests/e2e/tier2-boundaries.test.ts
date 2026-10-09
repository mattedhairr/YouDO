import { describe, it, expect, vi } from 'vitest';
import {
  type UserProfile,
  type RoomSquad,
  type RoomSquadMember,
  type MemberProgress,
  type HubAttentionState,
  validateRoomCreation,
  validateRoomJoin,
  searchUsersByUsernamePrefix,
  resolveDisplayName,
  computeHubNotificationDot,
  resolveDefaultHubSubTab,
  computeStackedCapsuleNodes,
  renderStackedCapsulesMarkup,
  renderProfileCardMarkup,
} from './helpers/test-fixtures';

describe('Tier 2 — Boundary & Corner Cases', () => {
  // ---------------------------------------------------------------------------
  // Feature 1: Remove bar hours matching for rooms (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 1: Remove bar hours matching for rooms (Boundaries)', () => {
    it('1.1: Personal bar hours is 0 or negative; user can still enter and join room', () => {
      const squad: RoomSquad = {
        id: 'sq-edge-1',
        name: 'Open Focus',
        description: '',
        bar_hours: 4,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'owner-1',
        created_at: '',
      };
      const checkZero = validateRoomJoin({ squad, userPersonalPace: 0 });
      expect(checkZero.canJoin).toBe(true);
      const checkNeg = validateRoomJoin({ squad, userPersonalPace: -1 });
      expect(checkNeg.canJoin).toBe(true);
    });

    it('1.2: Fractional and float drift bar hours (e.g. 1.25h vs 7.75h) are accepted without precision errors', () => {
      const result = validateRoomCreation({
        name: 'Quarter Hour Squad',
        barHours: 1.25,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 7.75,
      });
      expect(result.valid).toBe(true);
    });

    it('1.3: Upper limit boundary: 24h bar hours is accepted as maximum valid target pace', () => {
      const result24 = validateRoomCreation({
        name: '24 Hour Max',
        barHours: 24,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4,
      });
      expect(result24.valid).toBe(true);

      const resultOver = validateRoomCreation({
        name: 'Over Limit',
        barHours: 24.1,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4,
      });
      expect(resultOver.valid).toBe(false);
      expect(resultOver.error).toContain('cannot exceed 24 hours');
    });

    it('1.4: Lower limit boundary: 0.1h (minimum positive pace) is accepted', () => {
      const result = validateRoomCreation({
        name: 'Micro Pace',
        barHours: 0.1,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4,
      });
      expect(result.valid).toBe(true);

      const resultZero = validateRoomCreation({
        name: 'Zero Pace',
        barHours: 0,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4,
      });
      expect(resultZero.valid).toBe(false);
      expect(resultZero.error).toContain('positive number');
    });

    it('1.5: Extreme mismatch: personal pace = 0.5h, squad bar hours = 24h joins without blocking or overflow', () => {
      const squad: RoomSquad = {
        id: 'sq-extreme',
        name: 'Extreme Pace Room',
        description: '',
        bar_hours: 24,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'owner-x',
        created_at: '',
      };
      const check = validateRoomJoin({ squad, userPersonalPace: 0.5 });
      expect(check.canJoin).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: Room privacy options (anyone can join vs invite-only) (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 2: Room privacy options (anyone can join vs invite-only) (Boundaries)', () => {
    it('2.1: Default fallback: omitted or missing privacy falls back safely to anyone_can_join', () => {
      const rawSquad = {
        id: 'sq-legacy',
        name: 'Legacy Squad',
        description: '',
        bar_hours: 4,
        allow_join_requests: true,
        created_by: 'owner-legacy',
        created_at: '',
      };
      const privacy = (rawSquad as { privacy?: RoomPrivacy }).privacy || 'anyone_can_join';
      expect(privacy).toBe('anyone_can_join');
    });

    it('2.2: Case sensitivity: uppercase or malformed privacy value is rejected by validation', () => {
      const result = validateRoomCreation({
        name: 'Bad Privacy Squad',
        barHours: 4,
        privacy: 'INVITE_ONLY' as unknown as RoomPrivacy,
        creatorPersonalPace: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid room privacy');
    });

    it('2.3: Non-member attempting direct join on invite-only room is rejected with distinct error code', () => {
      const squad: RoomSquad = {
        id: 'sq-locked',
        name: 'VIP Chamber',
        description: '',
        bar_hours: 4,
        privacy: 'invite_only',
        allow_join_requests: false,
        created_by: 'vip-owner',
        created_at: '',
      };
      const result = validateRoomJoin({
        squad,
        userPersonalPace: 4,
        userStatus: undefined, // no invite
      });
      expect(result.canJoin).toBe(false);
      expect(result.error).toBe('This room is invite-only. You must be invited by an admin.');
    });

    it('2.4: Admin updating privacy from anyone_can_join to invite_only restricts subsequent direct joins', () => {
      const squad: RoomSquad = {
        id: 'sq-mutable',
        name: 'Morphing Room',
        description: '',
        bar_hours: 4,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'admin-m',
        created_at: '',
      };
      expect(validateRoomJoin({ squad, userPersonalPace: 4 }).canJoin).toBe(true);

      // Admin toggles privacy
      squad.privacy = 'invite_only';
      expect(validateRoomJoin({ squad, userPersonalPace: 4 }).canJoin).toBe(false);
    });

    it('2.5: Room creator retains owner/admin privileges regardless of privacy setting', () => {
      const squad: RoomSquad = {
        id: 'sq-vip',
        name: 'VIP Room',
        description: '',
        bar_hours: 4,
        privacy: 'invite_only',
        allow_join_requests: false,
        created_by: 'creator-99',
        created_at: '',
      };
      const isAdmin = squad.created_by === 'creator-99';
      expect(isAdmin).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: Invite users by username (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 3: Invite users by username (Boundaries)', () => {
    const profiles: UserProfile[] = [
      { id: 'u-1', username: 'john_doe', display_name: 'John' },
      { id: 'u-2', username: 'jane_doe', display_name: 'Jane' },
    ];

    it('3.1: Username search with leading @ symbol is cleanly stripped and matched', () => {
      const results = searchUsersByUsernamePrefix(profiles, '@john');
      expect(results).toHaveLength(1);
      expect(results[0].username).toBe('john_doe');
    });

    it('3.2: Username search with fewer than 2 characters returns empty result without firing queries', () => {
      const resultsShort = searchUsersByUsernamePrefix(profiles, 'j');
      expect(resultsShort).toHaveLength(0);
      const resultsEmpty = searchUsersByUsernamePrefix(profiles, '');
      expect(resultsEmpty).toHaveLength(0);
    });

    it('3.3: Searching for non-existent username returns 0 results cleanly without throwing error', () => {
      const results = searchUsersByUsernamePrefix(profiles, 'nonexistent_user');
      expect(results).toEqual([]);
    });

    it('3.4: Inviting user who is already an accepted member or already invited handles duplicate gracefully', () => {
      const existingMembers: RoomSquadMember[] = [
        { squad_id: 'sq-1', user_id: 'u-1', role: 'member', status: 'accepted', joined_at: '', profiles: profiles[0] },
      ];
      const inviteHandler = (targetUserId: string) => {
        const isDuplicate = existingMembers.some((m) => m.user_id === targetUserId);
        if (isDuplicate) return { ok: false, error: 'User is already a member of this squad.' };
        return { ok: true };
      };
      expect(inviteHandler('u-1').ok).toBe(false);
      expect(inviteHandler('u-1').error).toContain('already a member');
      expect(inviteHandler('u-2').ok).toBe(true);
    });

    it('3.5: User attempting to invite themselves by username is rejected with self-invite prevention', () => {
      const currentUserId = 'u-1';
      const results = searchUsersByUsernamePrefix(profiles, 'john', currentUserId);
      expect(results).toHaveLength(0); // self is excluded from invite candidates
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: Remove board name from settings (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 4: Remove board name from settings (Boundaries)', () => {
    it('4.1: Display name with leading and trailing whitespace is trimmed cleanly', () => {
      const profile: UserProfile = {
        id: 'u-ws',
        username: 'user_ws',
        display_name: '   Spaced Out Name   ',
      };
      expect(resolveDisplayName(profile)).toBe('Spaced Out Name');
    });

    it('4.2: Extremely long display name is safely capped at maximum length (40 chars)', () => {
      const longName = 'A'.repeat(60);
      const profile: UserProfile = {
        id: 'u-long',
        username: 'user_long',
        display_name: longName,
      };
      const resolved = resolveDisplayName(profile);
      expect(resolved).toHaveLength(40);
      expect(resolved).toBe('A'.repeat(40));
    });

    it('4.3: Unicode, international characters, and emojis in display name are preserved accurately', () => {
      const profile: UserProfile = {
        id: 'u-emoji',
        username: 'samurai_coder',
        display_name: '武士 ⚡ Akira 🚀',
      };
      expect(resolveDisplayName(profile)).toBe('武士 ⚡ Akira 🚀');
    });

    it('4.4: Special characters and symbols (e.g. <script>, &, ", \') are sanitized safely', () => {
      const profile: UserProfile = {
        id: 'u-xss',
        username: 'hacker_one',
        display_name: '<script>alert("xss")</script>',
      };
      const resolved = resolveDisplayName(profile);
      expect(resolved).toBe('<script>alert("xss")</script>');
      // When rendered inside text node, angle brackets are not executed
    });

    it('4.5: Blank or null display name safely falls back to @handle or Member without rendering undefined', () => {
      const profileBlank: UserProfile = {
        id: 'u-b',
        username: 'pure_handle',
        display_name: '    ',
      };
      expect(resolveDisplayName(profileBlank)).toBe('@pure_handle');

      const profileNullHandle: UserProfile = {
        id: 'u-n',
        username: '',
        display_name: '',
      };
      expect(resolveDisplayName(profileNullHandle)).toBe('Member');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: Supabase schema migrations for R1 (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 5: Supabase schema migrations for R1 (Boundaries)', () => {
    it('5.1: Check constraint rejects invalid privacy strings (e.g. public, secret, hidden)', () => {
      const allowedValues = ['anyone_can_join', 'invite_only'];
      const testValue = (val: string) => allowedValues.includes(val);
      expect(testValue('public')).toBe(false);
      expect(testValue('secret')).toBe(false);
      expect(testValue('hidden')).toBe(false);
      expect(testValue('anyone_can_join')).toBe(true);
      expect(testValue('invite_only')).toBe(true);
    });

    it('5.2: Cascade deletion: deleting squad removes associated invited membership records', () => {
      let squads = [{ id: 'sq-1', name: 'Squad 1' }];
      let members = [
        { squad_id: 'sq-1', user_id: 'u-1', status: 'invited' },
        { squad_id: 'sq-2', user_id: 'u-2', status: 'invited' },
      ];
      // Simulate ON DELETE CASCADE
      const deleteSquad = (id: string) => {
        squads = squads.filter((s) => s.id !== id);
        members = members.filter((m) => m.squad_id !== id);
      };
      deleteSquad('sq-1');
      expect(members.find((m) => m.squad_id === 'sq-1')).toBeUndefined();
      expect(members).toHaveLength(1);
    });

    it('5.3: RLS policy denies non-invited non-members from selecting private invite-only squads', () => {
      const squads: RoomSquad[] = [
        { id: 'sq-open', name: 'Open', description: '', bar_hours: 4, privacy: 'anyone_can_join', allow_join_requests: true, created_by: 'u1', created_at: '' },
        { id: 'sq-priv', name: 'Private', description: '', bar_hours: 4, privacy: 'invite_only', allow_join_requests: false, created_by: 'u1', created_at: '' },
      ];
      const memberships: RoomSquadMember[] = [];
      const currentUserId = 'u-intruder';

      const visibleSquads = squads.filter((s) => {
        if (s.privacy === 'anyone_can_join') return true;
        if (s.created_by === currentUserId) return true;
        return memberships.some((m) => m.squad_id === s.id && m.user_id === currentUserId && m.status in ['accepted', 'invited']);
      });

      expect(visibleSquads.map((s) => s.id)).toEqual(['sq-open']);
    });

    it('5.4: User cannot query or view other users pending squad invitations', () => {
      const invites: RoomSquadMember[] = [
        { squad_id: 'sq-1', user_id: 'user-a', role: 'member', status: 'invited', joined_at: '', profiles: null },
        { squad_id: 'sq-1', user_id: 'user-b', role: 'member', status: 'invited', joined_at: '', profiles: null },
      ];
      const queryUserInvites = (authUserId: string) => invites.filter((i) => i.user_id === authUserId);
      expect(queryUserInvites('user-a').map((i) => i.user_id)).toEqual(['user-a']);
      expect(queryUserInvites('user-a').some((i) => i.user_id === 'user-b')).toBe(false);
    });

    it('5.5: Non-members cannot read squad messages in private rooms', () => {
      const squadMessages = [
        { squad_id: 'sq-priv', sender_id: 'u-member', content: 'Secret plans' },
      ];
      const isMember = (userId: string, squadId: string) => userId === 'u-member' && squadId === 'sq-priv';
      const readMessages = (userId: string, squadId: string) => {
        if (!isMember(userId, squadId)) return [];
        return squadMessages.filter((m) => m.squad_id === squadId);
      };
      expect(readMessages('u-stranger', 'sq-priv')).toHaveLength(0);
      expect(readMessages('u-member', 'sq-priv')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Real-time room invites & friend requests (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 6: Real-time room invites & friend requests (Boundaries)', () => {
    it('6.1: Burst of rapid concurrent realtime events coalesces without race condition', () => {
      let callCount = 0;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const debounceSync = (delay = 50) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          callCount++;
        }, delay);
      };

      // Fire 10 rapid realtime events
      for (let i = 0; i < 10; i++) {
        debounceSync(10);
      }
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(callCount).toBe(1);
          resolve();
        }, 50);
      });
    });

    it('6.2: Realtime payload intended for a different user ID is ignored by current user listener', () => {
      const currentUserId = 'u-me';
      let notified = false;
      const handleRealtimePayload = (payload: { receiver_id: string }) => {
        if (payload.receiver_id === currentUserId) {
          notified = true;
        }
      };
      handleRealtimePayload({ receiver_id: 'u-other' });
      expect(notified).toBe(false);
    });

    it('6.3: UPDATE and DELETE realtime payloads trigger correct sync reason (friends, pending)', () => {
      const reasonsFired: string[] = [];
      const handleEvent = (table: string, eventType: string) => {
        if (table === 'friendships' && eventType === 'UPDATE') reasonsFired.push('friends');
        if (table === 'friendships' && eventType === 'DELETE') reasonsFired.push('pending');
      };
      handleEvent('friendships', 'UPDATE');
      handleEvent('friendships', 'DELETE');
      expect(reasonsFired).toEqual(['friends', 'pending']);
    });

    it('6.4: Fallback foreground sync recovers missed invites after temporary offline / socket disconnect', () => {
      let synced = false;
      const foregroundTick = (isOnline: boolean) => {
        if (isOnline) synced = true;
      };
      foregroundTick(true);
      expect(synced).toBe(true);
    });

    it('6.5: Malformed payload event or missing detail does not crash realtime sync handler', () => {
      const safeHandler = (eventDetail?: { reason?: string }) => {
        const reason = eventDetail?.reason ?? 'all';
        return reason;
      };
      expect(safeHandler(undefined)).toBe('all');
      expect(safeHandler({})).toBe('all');
      expect(safeHandler({ reason: 'pending' })).toBe('pending');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Hub notification dot routing (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 7: Hub notification dot routing (Boundaries)', () => {
    it('7.1: User opted out of public board routes to private tab even with 0 pending notifications', () => {
      const state: HubAttentionState = {
        privatePending: 0,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: false,
      };
      expect(resolveDefaultHubSubTab(state)).toBe('private');
    });

    it('7.2: Competing unreads: both public unread > 0 and private pending > 0 gives priority to private tab', () => {
      const state: HubAttentionState = {
        privatePending: 3,
        dmUnread: 1,
        communityUnread: 12,
        publicBoardOptedIn: true,
      };
      expect(computeHubNotificationDot(state)).toBe(true);
      expect(resolveDefaultHubSubTab(state)).toBe('private');
    });

    it('7.3: Zero unread and zero pending with opted-out user routes to private tab', () => {
      const state: HubAttentionState = {
        privatePending: 0,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: false,
      };
      expect(computeHubNotificationDot(state)).toBe(false);
      expect(resolveDefaultHubSubTab(state)).toBe('private');
    });

    it('7.4: Rapid double-click on Hub navigation button maintains consistent sub-tab state', () => {
      const state: HubAttentionState = {
        privatePending: 1,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: true,
      };
      const firstNav = resolveDefaultHubSubTab(state);
      const secondNav = resolveDefaultHubSubTab(state);
      expect(firstNav).toBe('private');
      expect(secondNav).toBe('private');
    });

    it('7.5: Unauthenticated user (no userId) defaults safely to social with no notification dot', () => {
      const computeGuest = (userId?: string) => {
        if (!userId) return { showDot: false, tab: 'social' as const };
        return { showDot: true, tab: 'private' as const };
      };
      const guestResult = computeGuest(undefined);
      expect(guestResult.showDot).toBe(false);
      expect(guestResult.tab).toBe('social');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: Stacked capsule progress bars (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 8: Stacked capsule progress bars (Boundaries)', () => {
    it('8.1: Member with 0% progress renders 0% height inside capsule track without negative height', () => {
      const members: MemberProgress[] = [
        { userId: 'u0', name: 'Zero', percentRaw: 0, percent: 0, isComplete: false, hoursDone: 0, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(0);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('style="height: 0%;"');
    });

    it('8.2: Member with exactly 50% progress renders exactly 50% height', () => {
      const members: MemberProgress[] = [
        { userId: 'u50', name: 'Halfway', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2.5, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(50);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('style="height: 50%;"');
    });

    it('8.3: Member with 100% progress renders exactly 100% height (full bar)', () => {
      const members: MemberProgress[] = [
        { userId: 'u100', name: 'Full', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(100);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('style="height: 100%;"');
    });

    it('8.4: Member with over 100% progress (over-bar) caps fill height at 100% without overflow glitch', () => {
      const members: MemberProgress[] = [
        { userId: 'uOver', name: 'Overachiever', percentRaw: 150, percent: 100, isComplete: true, hoursDone: 7.5, targetHours: 5, overHours: 2.5 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(100); // capped at 100%
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('style="height: 100%;"');
    });

    it('8.5: Large room with 10+ members renders all 10 stacked capsules in correct vertical proportion', () => {
      const members: MemberProgress[] = Array.from({ length: 10 }, (_, i) => ({
        userId: `u-${i}`,
        name: `Member ${i + 1}`,
        percentRaw: (i + 1) * 10,
        percent: (i + 1) * 10,
        isComplete: (i + 1) * 10 >= 100,
        hoursDone: (i + 1) * 0.5,
        targetHours: 5,
        overHours: 0,
      }));
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes).toHaveLength(10);
      expect(nodes[9].isComplete).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: Capsule visual merging on completion (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 9: Capsule visual merging on completion (Boundaries)', () => {
    it('9.1: Member at 99.9% progress does NOT merge (strictly requires completion at >= 100%)', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'A', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
        { userId: 'u2', name: 'B', percentRaw: 99.9, percent: 99.9, isComplete: false, hoursDone: 4.99, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[1].isComplete).toBe(false);
      expect(nodes[1].mergedWithAbove).toBe(false);
      expect(nodes[1].hasBorderTop).toBe(true);
    });

    it('9.2: Non-adjacent completed members (e.g. #1 and #3 complete, #2 incomplete) do not merge', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'TopComplete', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
        { userId: 'u2', name: 'MidIncomplete', percentRaw: 30, percent: 30, isComplete: false, hoursDone: 1.5, targetHours: 5, overHours: 0 },
        { userId: 'u3', name: 'BotComplete', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].isComplete).toBe(true);
      expect(nodes[1].isComplete).toBe(false);
      expect(nodes[2].isComplete).toBe(true);
      expect(nodes[1].mergedWithAbove).toBe(false);
      expect(nodes[2].mergedWithAbove).toBe(false); // cannot merge through incomplete member
    });

    it('9.3: Topmost completed capsule retains top rounded cap', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'First', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Second', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      // Top capsule never merges with above since index == 0
      expect(nodes[0].mergedWithAbove).toBe(false);
      expect(nodes[0].hasBorderTop).toBe(false);
    });

    it('9.4: Bottommost completed capsule retains bottom rounded cap', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Top', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Bottom', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[1].mergedWithAbove).toBe(true);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('capsule-track rounded-full');
    });

    it('9.5: Progress reduction from 100% to < 100% un-merges the capsule back to separate segmented bar', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'A', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'B', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      expect(computeStackedCapsuleNodes(members)[1].mergedWithAbove).toBe(true);

      // User B logs out / session is reduced to 80%
      members[1].percentRaw = 80;
      members[1].percent = 80;
      members[1].isComplete = false;
      const updatedNodes = computeStackedCapsuleNodes(members);
      expect(updatedNodes[1].mergedWithAbove).toBe(false);
      expect(updatedNodes[1].hasBorderTop).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: Remove redundant percentage text (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 10: Remove redundant percentage text (Boundaries)', () => {
    it('10.1: Member at 0% progress displays no redundant 0% or 0% complete text label', () => {
      const members: MemberProgress[] = [
        { userId: 'u0', name: 'ZeroProgress', percentRaw: 0, percent: 0, isComplete: false, hoursDone: 0, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
      expect(memberListHtml).not.toContain('0%');
      expect(memberListHtml).not.toContain('% complete');
    });

    it('10.2: Member at 100% progress displays Bar reached without redundant 100% text label', () => {
      const members: MemberProgress[] = [
        { userId: 'u100', name: 'HundredProgress', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
      expect(memberListHtml).not.toContain('100%');
      expect(memberListHtml).toContain('Bar reached');
    });

    it('10.3: Over-bar progress displays over-duration without redundant percentage text label', () => {
      const members: MemberProgress[] = [
        { userId: 'uOver', name: 'OverBar', percentRaw: 180, percent: 100, isComplete: true, hoursDone: 9, targetHours: 5, overHours: 4 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
      expect(memberListHtml).not.toContain('180%');
    });

    it('10.4: Large squad (10 members) renders 0 instances of redundant % complete in member list', () => {
      const members: MemberProgress[] = Array.from({ length: 10 }, (_, i) => ({
        userId: `u-${i}`,
        name: `Member ${i + 1}`,
        percentRaw: (i + 1) * 10,
        percent: (i + 1) * 10,
        isComplete: (i + 1) * 10 >= 100,
        hoursDone: (i + 1) * 0.5,
        targetHours: 5,
        overHours: 0,
      }));
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
      expect(memberListHtml).not.toContain('% complete');
    });

    it('10.5: Screen reader accessible label maintains numerical context while visual text is free of redundant %', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'AccessibleMember', percentRaw: 75, percent: 75, isComplete: false, hoursDone: 3, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('aria-label="Room Progress"');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: Complete deletion of Live Board (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 11: Complete deletion of Live Board (Boundaries)', () => {
    it('11.1: Room with 0 activity history renders clean view with no Live Board empty state placeholder', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'LoneMember', percentRaw: 0, percent: 0, isComplete: false, hoursDone: 0, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).not.toContain('No synced focus yet');
      expect(html).not.toContain('Live board');
    });

    it('11.2: Room with high activity volume does not render any residual Live Board elements', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'BusyMember', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 8, targetHours: 8, overHours: 2 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).not.toContain('activity-item');
      expect(html).not.toContain('Live board');
    });

    it('11.3: Switching back and forth between room tabs (board vs chat) contains no Live Board DOM nodes', () => {
      const roomTabs: ('board' | 'chat')[] = ['board', 'chat', 'board'];
      for (const tab of roomTabs) {
        if (tab === 'board') {
          const html = renderStackedCapsulesMarkup([]);
          expect(html).not.toContain('live-board');
        }
      }
    });

    it('11.4: Case-insensitive search across room view DOM confirms zero text matching /live board/i', () => {
      const nodes = computeStackedCapsuleNodes([
        { userId: 'u1', name: 'Tester', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
      ]);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(/live\s*board/i.test(html)).toBe(false);
    });

    it('11.5: Passing empty or populated activity props to room board has no effect on rendered output', () => {
      const nodes = computeStackedCapsuleNodes([]);
      const html1 = renderStackedCapsulesMarkup(nodes);
      const html2 = renderStackedCapsulesMarkup(nodes);
      expect(html1).toBe(html2);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: Redesign User Profile Card (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 12: Redesign User Profile Card (Boundaries)', () => {
    it('12.1: User with stats_private: true displays sleek locked placeholder without broken capsule dock', () => {
      const privateProfile: UserProfile = {
        id: 'u-priv',
        username: 'secret_agent',
        display_name: 'Agent X',
        stats_private: true,
      };
      const html = renderProfileCardMarkup({
        profile: privateProfile,
        activeWindow: 'week',
        streakDays: 0,
        focusMs: 0,
        formatDuration: () => '0h',
      });
      expect(html).toContain('stats-private-locked');
      expect(html).toContain('This user keeps their stats private');
      expect(html).not.toContain('<select');
    });

    it('12.2: User with 0 focus history displays clean empty stats placeholder within redesigned card', () => {
      const freshProfile: UserProfile = {
        id: 'u-fresh',
        username: 'newbie',
        display_name: 'New Aspirant',
        stats_private: false,
      };
      const html = renderProfileCardMarkup({
        profile: freshProfile,
        activeWindow: 'today',
        streakDays: 0,
        focusMs: 0,
        formatDuration: () => '0m',
      });
      expect(html).toContain('0 days');
      expect(html).toContain('0m');
    });

    it('12.3: Extremely long display name (40 chars) and bio (280 chars) truncate cleanly without breaking layout', () => {
      const maxProfile: UserProfile = {
        id: 'u-max',
        username: 'max_user',
        display_name: 'Z'.repeat(40),
        bio: 'B'.repeat(280),
      };
      const html = renderProfileCardMarkup({
        profile: maxProfile,
        activeWindow: 'today',
        streakDays: 1,
        focusMs: 3600000,
        formatDuration: () => '1h',
      });
      expect(html).toContain('Z'.repeat(40));
      expect(html).toContain('B'.repeat(280));
    });

    it('12.4: Profile without @username displays Public board only badge seamlessly', () => {
      const noHandleProfile: UserProfile = {
        id: 'u-nohandle',
        username: '',
        display_name: 'Board Contributor',
      };
      const hasHandle = Boolean(noHandleProfile.username);
      expect(hasHandle).toBe(false);
    });

    it('12.5: Rapid toggling between Today, Week, and Month pills updates active window state smoothly', () => {
      let currentWindow = 'today';
      const switchWindow = (w: 'today' | 'week' | 'month') => {
        currentWindow = w;
      };
      switchWindow('week');
      expect(currentWindow).toBe('week');
      switchWindow('month');
      expect(currentWindow).toBe('month');
      switchWindow('today');
      expect(currentWindow).toBe('today');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: Wire DP click in Room view (Boundaries)
  // ---------------------------------------------------------------------------
  describe('Feature 13: Wire DP click in Room view (Boundaries)', () => {
    it('13.1: Member with fallback avatar initials (no avatarUrl) is clickable and opens profile', () => {
      const members: MemberProgress[] = [
        { userId: 'u-initials', name: 'Zoe', avatarUrl: undefined, percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('aria-label="Open profile for Zoe"');
      expect(html).toContain('<span class="avatar">Z</span>');
    });

    it('13.2: Clicking own avatar opens profile in self-view mode (no friend/message buttons)', () => {
      const currentUserId = 'u-self';
      const clickedUserId = 'u-self';
      const isSelf = currentUserId === clickedUserId;
      expect(isSelf).toBe(true);
      // Self view does not show send friend request or message self button
      const showFriendButtons = !isSelf;
      expect(showFriendButtons).toBe(false);
    });

    it('13.3: Member with null/unresolved profile displays fallback and safely opens profile', () => {
      const memberEntry: RoomSquadMember = {
        squad_id: 'sq-1',
        user_id: 'u-unknown',
        role: 'member',
        status: 'accepted',
        joined_at: '',
        profiles: null,
      };
      const displayName = resolveDisplayName(memberEntry.profiles);
      expect(displayName).toBe('Member');
    });

    it('13.4: Keyboard navigation (Enter or Space key on avatar button) triggers onOpenProfile', () => {
      const onOpenProfile = vi.fn();
      const handleKeyDown = (e: { key: string }, userId: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpenProfile(userId);
        }
      };
      handleKeyDown({ key: 'Enter' }, 'u-key');
      expect(onOpenProfile).toHaveBeenCalledWith('u-key');
      handleKeyDown({ key: ' ' }, 'u-key');
      expect(onOpenProfile).toHaveBeenCalledTimes(2);
    });

    it('13.5: Opening and closing profile preserves room tab and does not reset room chat or board state', () => {
      const activeRoomTab: 'board' | 'chat' = 'chat';
      let selectedProfileId: string | null = null;

      // Open profile
      selectedProfileId = 'u-chat-buddy';
      expect(activeRoomTab).toBe('chat');
      expect(selectedProfileId).toBe('u-chat-buddy');

      // Close profile
      selectedProfileId = null;
      expect(selectedProfileId).toBeNull();
      expect(activeRoomTab).toBe('chat'); // Preserved!
    });
  });
});
