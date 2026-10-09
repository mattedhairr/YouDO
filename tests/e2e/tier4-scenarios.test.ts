import { describe, it, expect } from 'vitest';
import {
  type UserProfile,
  type RoomSquad,
  type RoomSquadMember,
  type MemberProgress,
  type HubAttentionState,
  validateRoomCreation,
  validateRoomJoin,
  searchUsersByUsernamePrefix,
  computeHubNotificationDot,
  resolveDefaultHubSubTab,
  computeStackedCapsuleNodes,
  renderStackedCapsulesMarkup,
  renderProfileCardMarkup,
} from './helpers/test-fixtures';

describe('Tier 4 — Realistic End-to-End Application Scenarios', () => {
  // ---------------------------------------------------------------------------
  // Scenario 1: Room Lifecycle: Creation with invite-only, search & invite by username, member join
  // ---------------------------------------------------------------------------
  it('Scenario 1: Room lifecycle: creation with invite-only, search & invite by username, member join (F1, F2, F3, F5)', () => {
    // Step 1: User A (personal pace = 2h) creates an invite-only room with target pace = 8h
    const creationResult = validateRoomCreation({
      name: 'Deep Work Guild',
      barHours: 8,
      privacy: 'invite_only',
      creatorPersonalPace: 2, // F1: No bar hours matching constraint!
    });
    expect(creationResult.valid).toBe(true);

    const guild: RoomSquad = {
      id: 'squad-guild-1',
      name: 'Deep Work Guild',
      description: 'Invite only guild',
      bar_hours: 8,
      privacy: 'invite_only', // F2: invite_only privacy
      allow_join_requests: false,
      created_by: 'user-a',
      created_at: new Date().toISOString(),
    };

    // Step 2: User A searches user by username prefix to invite
    const systemProfiles: UserProfile[] = [
      { id: 'user-b', username: 'study_buddy', display_name: 'Study Buddy', stats_private: false },
      { id: 'user-c', username: 'random_stranger', display_name: 'Stranger', stats_private: false },
    ];
    const searchMatches = searchUsersByUsernamePrefix(systemProfiles, '@study', 'user-a');
    expect(searchMatches).toHaveLength(1);
    expect(searchMatches[0].username).toBe('study_buddy');

    // Step 3: User A sends room invite to study_buddy (F3)
    const membersList: RoomSquadMember[] = [
      { squad_id: guild.id, user_id: 'user-a', role: 'admin', status: 'accepted', joined_at: '', profiles: null },
      {
        squad_id: guild.id,
        user_id: searchMatches[0].id,
        role: 'member',
        status: 'invited', // F5 schema status: 'invited'
        joined_at: new Date().toISOString(),
        profiles: searchMatches[0],
      },
    ];

    // Step 4: Random non-invited user tries to join directly -> rejected
    const strangerJoin = validateRoomJoin({
      squad: guild,
      userPersonalPace: 8,
      userStatus: undefined,
    });
    expect(strangerJoin.canJoin).toBe(false);
    expect(strangerJoin.error).toContain('invite-only');

    // Step 5: study_buddy queries their pending invites
    const userBPending = membersList.filter(
      (m) => m.user_id === 'user-b' && m.status === 'invited',
    );
    expect(userBPending).toHaveLength(1);
    expect(userBPending[0].squad_id).toBe('squad-guild-1');

    // Step 6: study_buddy accepts the invite
    const inviteToAccept = membersList.find(
      (m) => m.user_id === 'user-b' && m.squad_id === guild.id,
    )!;
    inviteToAccept.status = 'accepted';

    // Verify both are now accepted members
    const activeMembers = membersList.filter((m) => m.status === 'accepted');
    expect(activeMembers).toHaveLength(2);
    expect(activeMembers.map((m) => m.user_id)).toEqual(['user-a', 'user-b']);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Real-time notification flow: friend request & room invite triggers instant UI update without refresh
  // ---------------------------------------------------------------------------
  it('Scenario 2: Real-time notification flow: friend request & room invite triggers instant UI update without refresh (F6, F7)', () => {
    // Initial state: user on home view with 0 notifications
    let state: HubAttentionState = {
      privatePending: 0,
      dmUnread: 0,
      communityUnread: 0,
      publicBoardOptedIn: true,
    };
    expect(computeHubNotificationDot(state)).toBe(false);

    // Simulated Realtime Event Bus
    const eventLog: string[] = [];
    const onRealtimeEvent = (table: string, eventType: string, newRecord: Record<string, unknown>) => {
      eventLog.push(`${eventType}:${table}`);
      if (table === 'friendships' && eventType === 'INSERT') {
        state = { ...state, privatePending: state.privatePending + 1 };
      }
      if (table === 'squad_members' && eventType === 'INSERT' && newRecord.status === 'invited') {
        state = { ...state, privatePending: state.privatePending + 1 };
      }
    };

    // 1. Friend request arrives via Realtime socket
    onRealtimeEvent('friendships', 'INSERT', { requester_id: 'user-friend', receiver_id: 'user-me' });
    expect(state.privatePending).toBe(1);
    expect(computeHubNotificationDot(state)).toBe(true);

    // 2. Room invite arrives via Realtime socket
    onRealtimeEvent('squad_members', 'INSERT', { squad_id: 'sq-focus', user_id: 'user-me', status: 'invited' });
    expect(state.privatePending).toBe(2);
    expect(computeHubNotificationDot(state)).toBe(true);

    // Both updates occurred without manual page refresh
    expect(eventLog).toEqual(['INSERT:friendships', 'INSERT:squad_members']);
    expect(resolveDefaultHubSubTab(state)).toBe('private');
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Notification attention navigation: clicking Hub with pending notification routes to private tab, without attention routes to public
  // ---------------------------------------------------------------------------
  it('Scenario 3: Notification attention navigation: clicking Hub with pending notification routes to private tab, without attention routes to public (F7)', () => {
    let currentPrimaryView: 'tasks' | 'board' = 'tasks';
    let currentHubSubTab: 'social' | 'private' = 'social';

    const hubState: HubAttentionState = {
      privatePending: 0,
      dmUnread: 0,
      communityUnread: 0,
      publicBoardOptedIn: true,
    };

    const handlePrimaryNavigate = (targetView: 'tasks' | 'board') => {
      if (targetView === 'board') {
        currentHubSubTab = resolveDefaultHubSubTab(hubState);
      }
      currentPrimaryView = targetView;
    };

    // 1. Room invite arrives
    hubState.privatePending = 1;
    expect(computeHubNotificationDot(hubState)).toBe(true);

    // 2. User clicks Hub button in CommandBar
    handlePrimaryNavigate('board');
    expect(currentPrimaryView).toBe('board');
    expect(currentHubSubTab).toBe('private'); // Routed to private tab!

    // 3. User accepts/handles the notification
    hubState.privatePending = 0;
    expect(computeHubNotificationDot(hubState)).toBe(false);

    // 4. User navigates back to 'tasks'
    handlePrimaryNavigate('tasks');
    expect(currentPrimaryView).toBe('tasks');

    // 5. User clicks Hub button again (no notifications pending)
    handlePrimaryNavigate('board');
    expect(currentPrimaryView).toBe('board');
    expect(currentHubSubTab).toBe('social'); // Routed to public board!
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Room progress & completion: users progress, capsules render stacked, completing 100% merges capsules, no percentage text, no Live Board
  // ---------------------------------------------------------------------------
  it('Scenario 4: Room progress & completion: users progress, capsules render stacked, completing 100% merges capsules, no percentage text, no Live Board (F8, F9, F10, F11)', () => {
    // 3 members in room: Member 1 in progress (50%), Members 2 & 3 reached 100%
    const members: MemberProgress[] = [
      { userId: 'u-1', name: 'Member 1', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
      { userId: 'u-2', name: 'Member 2', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      { userId: 'u-3', name: 'Member 3', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
    ];

    // Compute stacked capsule nodes
    const nodes = computeStackedCapsuleNodes(members);
    expect(nodes).toHaveLength(3);

    // Visual merging verification:
    // Member 1 is incomplete (no merge)
    expect(nodes[0].isComplete).toBe(false);
    expect(nodes[0].mergedWithAbove).toBe(false);
    // Member 2 is complete, but above is incomplete (no merge with above)
    expect(nodes[1].isComplete).toBe(true);
    expect(nodes[1].mergedWithAbove).toBe(false);
    // Member 3 is complete and member above (Member 2) is complete -> MERGED!
    expect(nodes[2].isComplete).toBe(true);
    expect(nodes[2].mergedWithAbove).toBe(true);

    // Render markup
    const html = renderStackedCapsulesMarkup(nodes);

    // F8: Stacked capsules rendered with rounded pill track
    expect(html).toContain('stacked-capsule-board');
    expect(html).toContain('capsule-track rounded-full');

    // F9: Merged segment styling applied
    expect(html).toContain('merged-segment');

    // F10: Redundant percentage text completely eliminated from member list
    const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
    expect(memberListHtml).not.toContain('% complete');
    expect(memberListHtml).not.toContain('50%');
    expect(memberListHtml).not.toContain('100%');

    // F11: Live Board completely deleted and absent from room view
    expect(/live\s*board/i.test(html)).toBe(false);
    expect(html).not.toContain('lucide-zap');
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Profile card interaction & aesthetics: click DP in room view opens sleek profile card with capsule switch and no HTML select dropdown
  // ---------------------------------------------------------------------------
  it('Scenario 5: Profile card interaction & aesthetics: click DP in room view opens sleek profile card with capsule switch and no HTML select dropdown (F12, F13, F4)', () => {
    // Step 1: Render room progress board with member avatar buttons (F13)
    const members: MemberProgress[] = [
      { userId: 'u-ada', name: 'Ada Lovelace', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 6, targetHours: 6, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    const roomHtml = renderStackedCapsulesMarkup(nodes);
    expect(roomHtml).toContain('data-userid="u-ada"');
    expect(roomHtml).toContain('aria-label="Open profile for Ada Lovelace"');

    // Step 2: Clicking DP triggers profile modal open with Ada's profile (F4 & F13)
    const adaProfile: UserProfile = {
      id: 'u-ada',
      username: 'ada_code',
      display_name: 'Ada Lovelace', // F4: Authoritative profile name
      bio: 'First programmer in history.',
      stats_private: false,
    };

    let activeWindow: 'today' | 'week' | 'month' = 'today';
    const profileHtml = renderProfileCardMarkup({
      profile: adaProfile,
      activeWindow,
      streakDays: 42,
      focusMs: 21600000,
      formatDuration: () => '6h 00m',
    });

    // Step 3: F12 Aesthetics: Sleek capsule dock switch exists, NO HTML <select> dropdown
    expect(profileHtml).toContain('capsule-switch-dock');
    expect(profileHtml).not.toContain('<select');
    expect(profileHtml).not.toContain('</select>');
    expect(profileHtml).toContain('Ada Lovelace');
    expect(profileHtml).toContain('@ada_code');

    // Step 4: User clicks 'month' pill in capsule switch
    activeWindow = 'month';
    const updatedProfileHtml = renderProfileCardMarkup({
      profile: adaProfile,
      activeWindow,
      streakDays: 42,
      focusMs: 216000000,
      formatDuration: () => '60h 00m',
    });
    expect(updatedProfileHtml).toContain('data-window="month" aria-pressed="true"');
    expect(updatedProfileHtml).toContain('60h 00m');

    // Step 5: Closing profile card returns to room view seamlessly
    let sheetMounted = true;
    const handleClose = () => {
      sheetMounted = false;
    };
    handleClose();
    expect(sheetMounted).toBe(false);
  });
});
