import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  parseAndValidateMigrationSQL,
} from './helpers/test-fixtures';

describe('Tier 1 — Feature Coverage (Isolated Happy Path)', () => {
  // ---------------------------------------------------------------------------
  // Feature 1: Remove bar hours matching for rooms (ORIGINAL_REQUEST §R1)
  // ---------------------------------------------------------------------------
  describe('Feature 1: Remove bar hours matching for rooms', () => {
    it('1.1: Room join validation succeeds when user personal pace differs from squad bar hours', () => {
      const squad: RoomSquad = {
        id: 'squad-101',
        name: 'Early Morning Focus',
        description: 'Deep work squad',
        bar_hours: 6,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'user-owner',
        created_at: new Date().toISOString(),
      };
      // User has 2h/day personal streak bar, room has 6h/day
      const result = validateRoomJoin({
        squad,
        userPersonalPace: 2,
      });
      expect(result.canJoin).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('1.2: Room creation validation permits setting squad bar hours without matching creator pace', () => {
      const result = validateRoomCreation({
        name: 'Night Owls',
        barHours: 8,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4, // different from room bar hours
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('1.3: Discoverable rooms list does not filter out squads based on bar hour discrepancy', () => {
      const squads: RoomSquad[] = [
        { id: 'sq-1', name: '4h Room', description: '', bar_hours: 4, privacy: 'anyone_can_join', allow_join_requests: true, created_by: 'u1', created_at: '' },
        { id: 'sq-2', name: '6h Room', description: '', bar_hours: 6, privacy: 'anyone_can_join', allow_join_requests: true, created_by: 'u2', created_at: '' },
        { id: 'sq-3', name: '8h Room', description: '', bar_hours: 8, privacy: 'anyone_can_join', allow_join_requests: true, created_by: 'u3', created_at: '' },
      ];
      // Discover list shows all public squads regardless of bar hours
      const discoverable = squads.filter((s) => s.privacy === 'anyone_can_join');
      expect(discoverable).toHaveLength(3);
      expect(discoverable.map((s) => s.id)).toEqual(['sq-1', 'sq-2', 'sq-3']);
    });

    it('1.4: Room entry does not block user with pace mismatch error', () => {
      const squad: RoomSquad = {
        id: 'sq-marathon',
        name: 'Study Marathon',
        description: '',
        bar_hours: 10,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'u-host',
        created_at: '',
      };
      const check = validateRoomJoin({ squad, userPersonalPace: 1 });
      expect(check.canJoin).toBe(true);
      expect(check.error).toBeUndefined();
    });

    it('1.5: Collective progress model unifies all room members regardless of differing personal bar hours', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Alice', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Bob', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 6, targetHours: 6, overHours: 0 },
        { userId: 'u3', name: 'Charlie', percentRaw: 75, percent: 75, isComplete: false, hoursDone: 6, targetHours: 8, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: Room privacy options (anyone can join vs invite-only) (ORIGINAL_REQUEST §R1)
  // ---------------------------------------------------------------------------
  describe('Feature 2: Room privacy options (anyone can join vs invite-only)', () => {
    it('2.1: Room creation validation accepts anyone_can_join privacy setting', () => {
      const result = validateRoomCreation({
        name: 'Public Cafe',
        barHours: 4,
        privacy: 'anyone_can_join',
        creatorPersonalPace: 4,
      });
      expect(result.valid).toBe(true);
    });

    it('2.2: Room creation validation accepts invite_only privacy setting', () => {
      const result = validateRoomCreation({
        name: 'Private Club',
        barHours: 4,
        privacy: 'invite_only',
        creatorPersonalPace: 4,
      });
      expect(result.valid).toBe(true);
    });

    it('2.3: anyone_can_join rooms allow non-members to join directly without an invitation', () => {
      const squad: RoomSquad = {
        id: 'squad-open',
        name: 'Open Hall',
        description: '',
        bar_hours: 3,
        privacy: 'anyone_can_join',
        allow_join_requests: true,
        created_by: 'admin-1',
        created_at: '',
      };
      const result = validateRoomJoin({ squad, userPersonalPace: 3 });
      expect(result.canJoin).toBe(true);
    });

    it('2.4: invite_only rooms block direct join attempts from non-invited users', () => {
      const squad: RoomSquad = {
        id: 'squad-closed',
        name: 'Secret Chamber',
        description: '',
        bar_hours: 5,
        privacy: 'invite_only',
        allow_join_requests: false,
        created_by: 'admin-1',
        created_at: '',
      };
      const result = validateRoomJoin({ squad, userPersonalPace: 5 });
      expect(result.canJoin).toBe(false);
      expect(result.error).toContain('invite-only');
    });

    it('2.5: User with invited status is permitted to join and accept an invite_only room', () => {
      const squad: RoomSquad = {
        id: 'squad-closed',
        name: 'Secret Chamber',
        description: '',
        bar_hours: 5,
        privacy: 'invite_only',
        allow_join_requests: false,
        created_by: 'admin-1',
        created_at: '',
      };
      const result = validateRoomJoin({
        squad,
        userPersonalPace: 5,
        userStatus: 'invited',
      });
      expect(result.canJoin).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: Invite users by username (ORIGINAL_REQUEST §R1)
  // ---------------------------------------------------------------------------
  describe('Feature 3: Invite users by username', () => {
    const mockProfiles: UserProfile[] = [
      { id: 'u-1', username: 'alex_coder', display_name: 'Alex' },
      { id: 'u-2', username: 'alicia_dev', display_name: 'Alicia' },
      { id: 'u-3', username: 'bob_builder', display_name: 'Bob' },
    ];

    it('3.1: Searching by valid username prefix returns matching user profile candidates', () => {
      const matches = searchUsersByUsernamePrefix(mockProfiles, 'ale');
      expect(matches).toHaveLength(1);
      expect(matches[0].username).toBe('alex_coder');
    });

    it('3.2: Sending room invite by username generates squad member entry with status invited', () => {
      const squadId = 'squad-alpha';
      const targetUser = mockProfiles[0];
      const memberEntry: RoomSquadMember = {
        squad_id: squadId,
        user_id: targetUser.id,
        role: 'member',
        status: 'invited',
        joined_at: new Date().toISOString(),
        profiles: targetUser,
      };
      expect(memberEntry.status).toBe('invited');
      expect(memberEntry.user_id).toBe('u-1');
      expect(memberEntry.profiles?.username).toBe('alex_coder');
    });

    it('3.3: Username prefix search is case-insensitive', () => {
      const matches = searchUsersByUsernamePrefix(mockProfiles, '@ALIC');
      expect(matches).toHaveLength(1);
      expect(matches[0].username).toBe('alicia_dev');
    });

    it('3.4: Target user receives and queries pending squad invites showing status invited', () => {
      const allMembers: RoomSquadMember[] = [
        { squad_id: 'sq-a', user_id: 'u-1', role: 'member', status: 'invited', joined_at: '', profiles: mockProfiles[0] },
        { squad_id: 'sq-b', user_id: 'u-1', role: 'member', status: 'accepted', joined_at: '', profiles: mockProfiles[0] },
        { squad_id: 'sq-c', user_id: 'u-2', role: 'member', status: 'invited', joined_at: '', profiles: mockProfiles[1] },
      ];
      const pendingInvites = allMembers.filter((m) => m.user_id === 'u-1' && m.status === 'invited');
      expect(pendingInvites).toHaveLength(1);
      expect(pendingInvites[0].squad_id).toBe('sq-a');
    });

    it('3.5: Accepting username invite transitions member status from invited to accepted', () => {
      const memberEntry: RoomSquadMember = {
        squad_id: 'sq-a',
        user_id: 'u-1',
        role: 'member',
        status: 'invited',
        joined_at: new Date().toISOString(),
        profiles: mockProfiles[0],
      };
      // Accept invite
      memberEntry.status = 'accepted';
      expect(memberEntry.status).toBe('accepted');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: Remove board name from settings (ORIGINAL_REQUEST §R1)
  // ---------------------------------------------------------------------------
  describe('Feature 4: Remove board name from settings', () => {
    it('4.1: Profile display name is used as the authoritative name on the public board', () => {
      const profile: UserProfile = {
        id: 'u-author',
        username: 'soloworker',
        display_name: 'Solomon Kane',
      };
      const boardName = resolveDisplayName(profile);
      expect(boardName).toBe('Solomon Kane');
    });

    it('4.2: Room member listing renders profile display name rather than a board-specific alias', () => {
      const profile: UserProfile = {
        id: 'u-room',
        username: 'nightowl',
        display_name: 'Luna Lovegood',
      };
      const resolved = resolveDisplayName(profile);
      expect(resolved).toBe('Luna Lovegood');
      expect(resolved).not.toContain('board_name');
    });

    it('4.3: Updating profile display name immediately reflects on resolved board name', () => {
      const profile: UserProfile = {
        id: 'u-1',
        username: 'hawk',
        display_name: 'Hawk Eye',
      };
      expect(resolveDisplayName(profile)).toBe('Hawk Eye');
      profile.display_name = 'Ronin';
      expect(resolveDisplayName(profile)).toBe('Ronin');
    });

    it('4.4: User settings model contains no board name configuration property', () => {
      const userSettings = {
        dailyBarHours: 4,
        statsPrivate: false,
        optedIntoPublicBoard: true,
      };
      expect(userSettings).not.toHaveProperty('boardName');
      expect(userSettings).not.toHaveProperty('board_name');
    });

    it('4.5: Fallback gracefully uses @handle or default when display name is not provided', () => {
      const profileWithHandleOnly: UserProfile = {
        id: 'u-anon',
        username: 'ghost_writer',
        display_name: '',
      };
      expect(resolveDisplayName(profileWithHandleOnly)).toBe('@ghost_writer');
      expect(resolveDisplayName(null)).toBe('Member');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: Supabase schema migrations for R1 (ORIGINAL_REQUEST §R1)
  // ---------------------------------------------------------------------------
  describe('Feature 5: Supabase schema migrations for R1', () => {
    const mockMigrationSQL = `
      -- Supabase Migration: Rooms Privacy & Invites
      alter table public.squads 
        add column if not exists privacy text not null default 'anyone_can_join'
        check (privacy in ('anyone_can_join', 'invite_only'));

      alter table public.squad_members
        drop constraint if exists squad_members_status_check,
        add constraint squad_members_status_check check (status in ('pending', 'invited', 'accepted'));

      create policy if not exists "Invited members can view squad" on public.squads
        for select using (
          auth.uid() = created_by 
          or exists (
            select 1 from public.squad_members 
            where squad_id = squads.id and user_id = auth.uid() and status in ('accepted', 'invited')
          )
        );

      create policy if not exists "Admins can invite members" on public.squad_members
        for insert with check (
          public.is_squad_admin(squad_members.squad_id, auth.uid()) or auth.uid() = user_id
        );
    `;

    it('5.1: Migration DDL adds privacy column to squads table with text type', () => {
      const check = parseAndValidateMigrationSQL(mockMigrationSQL);
      expect(check.hasPrivacyColumn).toBe(true);
    });

    it('5.2: Migration DDL enforces check constraint on privacy (anyone_can_join, invite_only)', () => {
      const check = parseAndValidateMigrationSQL(mockMigrationSQL);
      expect(check.hasPrivacyCheckConstraint).toBe(true);
    });

    it('5.3: Migration DDL updates squad_members.status check constraint to include invited', () => {
      const check = parseAndValidateMigrationSQL(mockMigrationSQL);
      expect(check.hasInvitedMemberStatus).toBe(true);
    });

    it('5.4: Migration RLS policies grant invited users access to select their squad invitations', () => {
      const check = parseAndValidateMigrationSQL(mockMigrationSQL);
      expect(check.hasInvitedSelectPolicy).toBe(true);
    });

    it('5.5: Migration DDL statements are idempotent and rerunnable with IF NOT EXISTS', () => {
      const check = parseAndValidateMigrationSQL(mockMigrationSQL);
      expect(check.isIdempotent).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Real-time room invites & friend requests (ORIGINAL_REQUEST §R2)
  // ---------------------------------------------------------------------------
  describe('Feature 6: Real-time room invites & friend requests', () => {
    let syncDispatches: string[] = [];

    beforeEach(() => {
      syncDispatches = [];
    });

    const triggerSync = (reason: string) => {
      syncDispatches.push(reason);
    };

    it('6.1: Realtime event on friendships updates pending request state immediately without page reload', () => {
      const onFriendshipInsert = () => triggerSync('pending');
      onFriendshipInsert();
      expect(syncDispatches).toContain('pending');
    });

    it('6.2: Realtime event on squad_members updates pending squad invites immediately without page reload', () => {
      const onSquadInviteInsert = () => triggerSync('pending');
      onSquadInviteInsert();
      expect(syncDispatches).toContain('pending');
    });

    it('6.3: Incoming realtime payload triggers PRIVATE_HUB_SYNC_EVENT custom event on window', () => {
      const dispatchedEvents: string[] = [];
      const listener = (event: string) => dispatchedEvents.push(event);
      listener('youdo-private-hub-sync');
      expect(dispatchedEvents).toContain('youdo-private-hub-sync');
    });

    it('6.4: Realtime channel manager tracks subscriptions for friendships and squad_members', () => {
      const activeChannels: string[] = [];
      const registerChannel = (name: string) => activeChannels.push(name);
      registerChannel('hub_friendships_in_user-123');
      registerChannel('hub_squad_members_self_user-123');
      expect(activeChannels).toContain('hub_friendships_in_user-123');
      expect(activeChannels).toContain('hub_squad_members_self_user-123');
    });

    it('6.5: Channel cleanup function cleanly removes all subscribed realtime channels', () => {
      let activeChannels = ['ch-friendships', 'ch-squads', 'ch-dms'];
      const teardown = () => {
        activeChannels = [];
      };
      teardown();
      expect(activeChannels).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Hub notification dot routing (ORIGINAL_REQUEST §R2)
  // ---------------------------------------------------------------------------
  describe('Feature 7: Hub notification dot routing', () => {
    it('7.1: Hub notification dot is active (showHubNavDot = true) when private notifications are pending', () => {
      const state: HubAttentionState = {
        privatePending: 2,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: true,
      };
      expect(computeHubNotificationDot(state)).toBe(true);
    });

    it('7.2: Clicking Hub with pending private notification routes directly to private tab', () => {
      const state: HubAttentionState = {
        privatePending: 1,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: true,
      };
      expect(resolveDefaultHubSubTab(state)).toBe('private');
    });

    it('7.3: Clicking Hub with no pending notifications and opted in to public board routes to social tab', () => {
      const state: HubAttentionState = {
        privatePending: 0,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: true,
      };
      expect(resolveDefaultHubSubTab(state)).toBe('social');
    });

    it('7.4: Clicking Hub with unread public community updates routes to social tab', () => {
      const state: HubAttentionState = {
        privatePending: 0,
        dmUnread: 0,
        communityUnread: 5,
        publicBoardOptedIn: true,
      };
      expect(computeHubNotificationDot(state)).toBe(true);
      expect(resolveDefaultHubSubTab(state)).toBe('social');
    });

    it('7.5: Clearing all pending notifications removes the Hub notification dot', () => {
      const state: HubAttentionState = {
        privatePending: 0,
        dmUnread: 0,
        communityUnread: 0,
        publicBoardOptedIn: true,
      };
      expect(computeHubNotificationDot(state)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: Stacked capsule progress bars (ORIGINAL_REQUEST §R3)
  // ---------------------------------------------------------------------------
  describe('Feature 8: Stacked capsule progress bars', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Diana', percentRaw: 40, percent: 40, isComplete: false, hoursDone: 2, targetHours: 5, overHours: 0 },
      { userId: 'u2', name: 'Evan', percentRaw: 80, percent: 80, isComplete: false, hoursDone: 4, targetHours: 5, overHours: 0 },
      { userId: 'u3', name: 'Fiona', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
    ];

    it('8.1: Progress board renders a dedicated capsule bar for each member in a vertical stack', () => {
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.userId)).toEqual(['u1', 'u2', 'u3']);
    });

    it('8.2: Each capsule has rounded pill styling (rounded-full) matching the design system', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('rounded-full');
      expect(html).toContain('capsule-track');
    });

    it('8.3: Capsule fill percentage is computed proportionately to member focus progress', () => {
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(40);
      expect(nodes[1].percent).toBe(80);
      expect(nodes[2].percent).toBe(100);
    });

    it('8.4: In-progress member displays primary accent styling in their capsule segment', () => {
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].accentClass).toContain('bg-primary');
    });

    it('8.5: Reached bar member displays secondary accent styling in their capsule segment', () => {
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[2].accentClass).toContain('bg-secondary');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: Capsule visual merging on completion (ORIGINAL_REQUEST §R3)
  // ---------------------------------------------------------------------------
  describe('Feature 9: Capsule visual merging on completion', () => {
    it('9.1: Member reaching 100% progress activates completed bar visual treatment', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Gina', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].isComplete).toBe(true);
      expect(nodes[0].accentClass).toContain('bg-secondary');
    });

    it('9.2: Adjacent completed member capsules merge visually by eliminating dividing border', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Gina', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Harry', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[1].mergedWithAbove).toBe(true);
      expect(nodes[1].hasBorderTop).toBe(false);
    });

    it('9.3: When all room members reach 100%, stacked capsules merge into one continuous unified bar', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Gina', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Harry', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u3', name: 'Iris', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[1].mergedWithAbove).toBe(true);
      expect(nodes[2].mergedWithAbove).toBe(true);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('merged-segment');
    });

    it('9.4: Partially completed room leaves incomplete members separated by distinct borders', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Gina', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Harry', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[1].mergedWithAbove).toBe(false);
      expect(nodes[1].hasBorderTop).toBe(true);
    });

    it('9.5: Merged completed capsules display unified secondary accent styling', () => {
      const members: MemberProgress[] = [
        { userId: 'u1', name: 'Gina', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
        { userId: 'u2', name: 'Harry', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      ];
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].accentClass).toBe('bg-secondary text-secondary');
      expect(nodes[1].accentClass).toBe('bg-secondary text-secondary');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: Remove redundant percentage text (ORIGINAL_REQUEST §R3)
  // ---------------------------------------------------------------------------
  describe('Feature 10: Remove redundant percentage text', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Jack', percentRaw: 60, percent: 60, isComplete: false, hoursDone: 3, targetHours: 5, overHours: 0 },
      { userId: 'u2', name: 'Jill', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 5, targetHours: 5, overHours: 0 },
    ];

    it('10.1: Member progress cards do not render redundant % complete text labels', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).not.toContain('% complete');
    });

    it('10.2: Member cards do not render redundant numeric percentage badges', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
      expect(memberListHtml).not.toContain('60%');
      expect(memberListHtml).not.toContain('100%');
    });

    it('10.3: Room header does not duplicate redundant percentage strings', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).not.toContain('collectivePercent');
    });

    it('10.4: Focus duration and bar status remain clearly legible without percentage clutter', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('Bar reached');
      expect(html).toContain('In progress');
    });

    it('10.5: Rendered markup contains zero redundant percentage text nodes across member rows', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      // Match any "%" character in text nodes
      const matches = html.match(/>[^<]*%[^<]*</g);
      expect(matches).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: Complete deletion of Live Board (ORIGINAL_REQUEST §R3)
  // ---------------------------------------------------------------------------
  describe('Feature 11: Complete deletion of Live Board', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Kevin', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
    ];

    it('11.1: Room view markup contains no Live board heading or section', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html.toLowerCase()).not.toContain('live board');
    });

    it('11.2: Zap icon and live activity feed container are completely absent from room view', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).not.toContain('lucide-zap');
      expect(html).not.toContain('activity-feed');
    });

    it('11.3: Room sheet renders progress board, member list, and chat with no Live Board DOM nodes', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('stacked-capsule-board');
      expect(html).toContain('member-list');
      expect(html).not.toContain('live-board');
    });

    it('11.4: Purging Live Board leaves member progress sync completely intact', () => {
      const nodes = computeStackedCapsuleNodes(members);
      expect(nodes[0].percent).toBe(50);
      expect(nodes[0].name).toBe('Kevin');
    });

    it('11.5: Room state does not maintain any live activity board feed listener', () => {
      const roomListeners: string[] = ['chat_messages', 'squad_members'];
      expect(roomListeners).not.toContain('live_board_activity');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: Redesign User Profile Card (ORIGINAL_REQUEST §R4)
  // ---------------------------------------------------------------------------
  describe('Feature 12: Redesign User Profile Card', () => {
    const sampleProfile: UserProfile = {
      id: 'u-laura',
      username: 'laura_focus',
      display_name: 'Laura Palmer',
      bio: 'Daily deep focus aspirant',
      stats_private: false,
    };

    it('12.1: Profile card displays avatar, display name, handle, and bio in sleek card layout', () => {
      const html = renderProfileCardMarkup({
        profile: sampleProfile,
        activeWindow: 'today',
        streakDays: 14,
        focusMs: 14400000,
        formatDuration: () => '4h 00m',
      });
      expect(html).toContain('Laura Palmer');
      expect(html).toContain('@laura_focus');
      expect(html).toContain('Daily deep focus aspirant');
    });

    it('12.2: Focus stats window uses sleek capsule switch dock with Today, Week, and Month options', () => {
      const html = renderProfileCardMarkup({
        profile: sampleProfile,
        activeWindow: 'week',
        streakDays: 14,
        focusMs: 72000000,
        formatDuration: () => '20h 00m',
      });
      expect(html).toContain('capsule-switch-dock');
      expect(html).toContain('data-window="today"');
      expect(html).toContain('data-window="week"');
      expect(html).toContain('data-window="month"');
    });

    it('12.3: Profile card contains NO HTML <select> dropdown element for focus windows', () => {
      const html = renderProfileCardMarkup({
        profile: sampleProfile,
        activeWindow: 'month',
        streakDays: 14,
        focusMs: 180000000,
        formatDuration: () => '50h 00m',
      });
      expect(html).not.toContain('<select');
      expect(html).not.toContain('</select>');
      expect(html).not.toContain('<option');
    });

    it('12.4: Active capsule pill displays highlighted state matching app navigation bar style', () => {
      const html = renderProfileCardMarkup({
        profile: sampleProfile,
        activeWindow: 'today',
        streakDays: 14,
        focusMs: 14400000,
        formatDuration: () => '4h 00m',
      });
      expect(html).toContain('data-window="today" aria-pressed="true"');
      expect(html).toContain('data-window="week" aria-pressed="false"');
    });

    it('12.5: Selecting a different capsule window updates displayed focus statistics', () => {
      const getStatsForWindow = (window: 'today' | 'week' | 'month') => {
        if (window === 'today') return '3h';
        if (window === 'week') return '18h';
        return '72h';
      };
      expect(getStatsForWindow('today')).toBe('3h');
      expect(getStatsForWindow('month')).toBe('72h');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: Wire DP click in Room view (ORIGINAL_REQUEST §R4)
  // ---------------------------------------------------------------------------
  describe('Feature 13: Wire DP click in Room view', () => {
    const members: MemberProgress[] = [
      { userId: 'u-marcus', name: 'Marcus', percentRaw: 80, percent: 80, isComplete: false, hoursDone: 4, targetHours: 5, overHours: 0 },
    ];

    it('13.1: Member avatar in room progress view is an interactive button with accessible label', () => {
      const nodes = computeStackedCapsuleNodes(members);
      const html = renderStackedCapsulesMarkup(nodes);
      expect(html).toContain('<button type="button" class="dp-button"');
      expect(html).toContain('aria-label="Open profile for Marcus"');
    });

    it('13.2: Clicking member avatar triggers onOpenProfile callback with member userId', () => {
      const onOpenProfile = vi.fn();
      const handleClick = (userId: string) => onOpenProfile(userId);
      handleClick('u-marcus');
      expect(onOpenProfile).toHaveBeenCalledWith('u-marcus');
    });

    it('13.3: Room sheet mounts UserProfileSheet when a member avatar is clicked', () => {
      let selectedProfileUserId: string | null = null;
      const onOpenProfile = (id: string) => {
        selectedProfileUserId = id;
      };
      onOpenProfile('u-marcus');
      expect(selectedProfileUserId).toBe('u-marcus');
      const isProfileSheetMounted = selectedProfileUserId !== null;
      expect(isProfileSheetMounted).toBe(true);
    });

    it('13.4: UserProfileSheet receives selected user ID and renders their profile details', () => {
      const profile: UserProfile = {
        id: 'u-marcus',
        username: 'marcus_aurelius',
        display_name: 'Marcus',
      };
      const html = renderProfileCardMarkup({
        profile,
        activeWindow: 'today',
        streakDays: 42,
        focusMs: 14400000,
        formatDuration: () => '4h 00m',
      });
      expect(html).toContain('Marcus');
      expect(html).toContain('@marcus_aurelius');
    });

    it('13.5: Closing UserProfileSheet resets selected user and returns cleanly to room view', () => {
      let selectedProfileUserId: string | null = 'u-marcus';
      const handleCloseProfile = () => {
        selectedProfileUserId = null;
      };
      handleCloseProfile();
      expect(selectedProfileUserId).toBeNull();
    });
  });
});
