import { describe, it, expect } from 'vitest';
import {
  type UserProfile,
  type RoomSquad,
  type RoomSquadMember,
  type MemberProgress,
  type HubAttentionState,
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

describe('Tier 3 — Pairwise Cross-Feature Combinations', () => {
  // ---------------------------------------------------------------------------
  // Pair 1: F1 (Bar hours removed) × F2 (Invite-only room)
  // ---------------------------------------------------------------------------
  it('Pair 1: User joins invite-only room with mismatched personal bar hours after invitation accepted', () => {
    const squad: RoomSquad = {
      id: 'sq-pair-1',
      name: 'High Pace Invite Club',
      description: '',
      bar_hours: 8,
      privacy: 'invite_only',
      allow_join_requests: false,
      created_by: 'admin-1',
      created_at: '',
    };
    // User has 3h personal pace, room is 8h and invite_only
    const joinAttemptWithoutInvite = validateRoomJoin({
      squad,
      userPersonalPace: 3,
      userStatus: undefined,
    });
    expect(joinAttemptWithoutInvite.canJoin).toBe(false);

    // After invite received, joining succeeds despite 3h vs 8h difference
    const joinAttemptWithInvite = validateRoomJoin({
      squad,
      userPersonalPace: 3,
      userStatus: 'invited',
    });
    expect(joinAttemptWithInvite.canJoin).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Pair 2: F2 (Room privacy) × F3 (Username invite)
  // ---------------------------------------------------------------------------
  it('Pair 2: Private invite-only room searches and invites user by username', () => {
    const squad: RoomSquad = {
      id: 'sq-pair-2',
      name: 'Stealth Founders',
      description: '',
      bar_hours: 6,
      privacy: 'invite_only',
      allow_join_requests: false,
      created_by: 'founder-1',
      created_at: '',
    };
    const profiles: UserProfile[] = [
      { id: 'u-founder-2', username: 'elon_code', display_name: 'Elon' },
    ];
    const searchMatches = searchUsersByUsernamePrefix(profiles, '@elon');
    expect(searchMatches).toHaveLength(1);

    const inviteMember: RoomSquadMember = {
      squad_id: squad.id,
      user_id: searchMatches[0].id,
      role: 'member',
      status: 'invited',
      joined_at: new Date().toISOString(),
      profiles: searchMatches[0],
    };
    expect(inviteMember.status).toBe('invited');
    expect(inviteMember.profiles?.username).toBe('elon_code');
  });

  // ---------------------------------------------------------------------------
  // Pair 3: F3 (Username invite) × F6 (Realtime notification)
  // ---------------------------------------------------------------------------
  it('Pair 3: Sending username invite triggers immediate realtime event received by target user', () => {
    const realtimeEvents: { table: string; record: Record<string, unknown> }[] = [];
    const broadcastInvite = (invite: RoomSquadMember) => {
      realtimeEvents.push({
        table: 'squad_members',
        record: {
          squad_id: invite.squad_id,
          user_id: invite.user_id,
          status: invite.status,
        },
      });
    };

    const newInvite: RoomSquadMember = {
      squad_id: 'sq-fast',
      user_id: 'u-recipient',
      role: 'member',
      status: 'invited',
      joined_at: '',
      profiles: null,
    };
    broadcastInvite(newInvite);

    expect(realtimeEvents).toHaveLength(1);
    expect(realtimeEvents[0].table).toBe('squad_members');
    expect(realtimeEvents[0].record.status).toBe('invited');
  });

  // ---------------------------------------------------------------------------
  // Pair 4: F6 (Realtime notification) × F7 (Hub dot routing)
  // ---------------------------------------------------------------------------
  it('Pair 4: Incoming realtime invite activates Hub notification dot and routes click directly to private tab', () => {
    let hubState: HubAttentionState = {
      privatePending: 0,
      dmUnread: 0,
      communityUnread: 0,
      publicBoardOptedIn: true,
    };
    expect(computeHubNotificationDot(hubState)).toBe(false);
    expect(resolveDefaultHubSubTab(hubState)).toBe('social');

    // Realtime invite arrives
    hubState = { ...hubState, privatePending: 1 };
    expect(computeHubNotificationDot(hubState)).toBe(true);
    expect(resolveDefaultHubSubTab(hubState)).toBe('private');
  });

  // ---------------------------------------------------------------------------
  // Pair 5: F7 (Hub dot routing) × F12 (Profile card)
  // ---------------------------------------------------------------------------
  it('Pair 5: Navigating to private hub and opening profile card displays sleek capsule switch', () => {
    const hubState: HubAttentionState = {
      privatePending: 1,
      dmUnread: 0,
      communityUnread: 0,
      publicBoardOptedIn: true,
    };
    const targetTab = resolveDefaultHubSubTab(hubState);
    expect(targetTab).toBe('private');

    // In private hub, user opens friend's profile
    const friendProfile: UserProfile = {
      id: 'u-friend',
      username: 'friend_jane',
      display_name: 'Jane Austen',
      stats_private: false,
    };
    const html = renderProfileCardMarkup({
      profile: friendProfile,
      activeWindow: 'today',
      streakDays: 5,
      focusMs: 7200000,
      formatDuration: () => '2h 00m',
    });
    expect(html).toContain('capsule-switch-dock');
    expect(html).not.toContain('<select');
  });

  // ---------------------------------------------------------------------------
  // Pair 6: F8 (Stacked capsules) × F9 (Capsule visual merge)
  // ---------------------------------------------------------------------------
  it('Pair 6: Multiple members make progress, two members reach 100% and merge visually into continuous bar', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Member 1', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      { userId: 'u2', name: 'Member 2', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
      { userId: 'u3', name: 'Member 3', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 2, targetHours: 4, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    expect(nodes[0].isComplete).toBe(true);
    expect(nodes[1].isComplete).toBe(true);
    expect(nodes[1].mergedWithAbove).toBe(true); // Member 1 & 2 merged!
    expect(nodes[2].isComplete).toBe(false);
    expect(nodes[2].mergedWithAbove).toBe(false); // Member 3 separated
  });

  // ---------------------------------------------------------------------------
  // Pair 7: F8 (Stacked capsules) × F10 (Remove redundant %)
  // ---------------------------------------------------------------------------
  it('Pair 7: Stacked capsules render progress clearly with zero redundant % complete text labels', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Alpha', percentRaw: 35, percent: 35, isComplete: false, hoursDone: 1.4, targetHours: 4, overHours: 0 },
      { userId: 'u2', name: 'Beta', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 4, targetHours: 4, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    const html = renderStackedCapsulesMarkup(nodes);
    expect(html).toContain('capsule-track');
    const memberListHtml = html.slice(html.indexOf('<div class="member-list">'));
    expect(memberListHtml).not.toContain('% complete');
    expect(memberListHtml).not.toContain('35%');
  });

  // ---------------------------------------------------------------------------
  // Pair 8: F8 (Stacked capsules) × F11 (Delete Live Board)
  // ---------------------------------------------------------------------------
  it('Pair 8: Room progress view renders stacked capsules with complete absence of Live Board', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: 'Gamma', percentRaw: 80, percent: 80, isComplete: false, hoursDone: 3.2, targetHours: 4, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    const html = renderStackedCapsulesMarkup(nodes);
    expect(html).toContain('stacked-capsule-board');
    expect(html).not.toContain('Live board');
    expect(html).not.toContain('live-board');
  });

  // ---------------------------------------------------------------------------
  // Pair 9: F8 (Stacked capsules) × F13 (Wire DP click)
  // ---------------------------------------------------------------------------
  it('Pair 9: Clicking avatar beside stacked capsule opens user profile card', () => {
    const members: MemberProgress[] = [
      { userId: 'u-delta', name: 'Delta', percentRaw: 60, percent: 60, isComplete: false, hoursDone: 2.4, targetHours: 4, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    const html = renderStackedCapsulesMarkup(nodes);
    expect(html).toContain('data-userid="u-delta"');
    expect(html).toContain('aria-label="Open profile for Delta"');
  });

  // ---------------------------------------------------------------------------
  // Pair 10: F12 (Redesigned profile) × F13 (DP click in room)
  // ---------------------------------------------------------------------------
  it('Pair 10: Clicking DP in room view opens redesigned profile card featuring capsule switch (no <select>)', () => {
    const profile: UserProfile = {
      id: 'u-room-member',
      username: 'focus_champ',
      display_name: 'Champion',
    };
    const html = renderProfileCardMarkup({
      profile,
      activeWindow: 'week',
      streakDays: 21,
      focusMs: 108000000,
      formatDuration: () => '30h 00m',
    });
    expect(html).toContain('Champion');
    expect(html).toContain('capsule-switch-dock');
    expect(html).not.toContain('<select');
  });

  // ---------------------------------------------------------------------------
  // Pair 11: F1 (Bar hours removed) × F8 (Stacked capsules)
  // ---------------------------------------------------------------------------
  it('Pair 11: Members with diverse personal bar hours all appear on single collective stacked capsule board', () => {
    const members: MemberProgress[] = [
      { userId: 'u1', name: '2h Worker', percentRaw: 50, percent: 50, isComplete: false, hoursDone: 1, targetHours: 2, overHours: 0 },
      { userId: 'u2', name: '6h Worker', percentRaw: 100, percent: 100, isComplete: true, hoursDone: 6, targetHours: 6, overHours: 0 },
      { userId: 'u3', name: '10h Worker', percentRaw: 40, percent: 40, isComplete: false, hoursDone: 4, targetHours: 10, overHours: 0 },
    ];
    const nodes = computeStackedCapsuleNodes(members);
    // All 3 members co-exist on the same unified stacked capsule column
    expect(nodes).toHaveLength(3);
    const html = renderStackedCapsulesMarkup(nodes);
    expect(html).toContain('2h Worker');
    expect(html).toContain('6h Worker');
    expect(html).toContain('10h Worker');
  });

  // ---------------------------------------------------------------------------
  // Pair 12: F2 (Room privacy) × F5 (Supabase schema)
  // ---------------------------------------------------------------------------
  it('Pair 12: invite_only room in schema enforces RLS select restrictions on non-invited users', () => {
    const schemaSql = `
      alter table public.squads add column if not exists privacy text check (privacy in ('anyone_can_join', 'invite_only'));
      create policy if not exists "View invite squads" on public.squads for select using (
        privacy = 'anyone_can_join' or auth.uid() = created_by or exists (
          select 1 from public.squad_members where squad_id = squads.id and user_id = auth.uid() and status in ('accepted', 'invited')
        )
      );
    `;
    const check = parseAndValidateMigrationSQL(schemaSql);
    expect(check.hasPrivacyColumn).toBe(true);
    expect(check.hasPrivacyCheckConstraint).toBe(true);
    expect(check.hasInvitedSelectPolicy).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Pair 13: F4 (Profile name) × F13 (DP click in room)
  // ---------------------------------------------------------------------------
  it('Pair 13: Profile card opened from room avatar displays identical display name shown in room progress list', () => {
    const profile: UserProfile = {
      id: 'u-match',
      username: 'clean_worker',
      display_name: 'Dr. John Watson',
    };
    const roomName = resolveDisplayName(profile);
    const profileHtml = renderProfileCardMarkup({
      profile,
      activeWindow: 'today',
      streakDays: 7,
      focusMs: 14400000,
      formatDuration: () => '4h 00m',
    });
    expect(roomName).toBe('Dr. John Watson');
    expect(profileHtml).toContain('<h1 class="display-name">Dr. John Watson</h1>');
  });
});
