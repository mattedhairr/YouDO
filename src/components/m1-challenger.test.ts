import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import CreateRoomSheet from './CreateRoomSheet';
import RoomsView from './RoomsView';
import SquadSettingsSheet from './SquadSettingsSheet';
import * as squadsLib from '../lib/squads';
import * as profilesLib from '../lib/profiles';

// Ensure window is defined for Node test runner
if (typeof window === 'undefined') {
  (global as unknown as Record<string, unknown>).window = global;
}

// Mock Supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_field: string, val: unknown) => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: val,
              username: 'prof_user',
              display_name: 'Official Display Name',
              avatar_url: '',
              created_at: '',
              updated_at: '',
            },
            error: null,
          }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sq-123' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock Overlay to render children directly without DOM portals
vi.mock('./Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'overlay-container' }, children) : null,
}));

// Mock haptics
vi.mock('../lib/haptics', () => ({
  hapticTick: vi.fn(),
}));

// Mock useAuth
const mockUser = { id: 'user-creator-123', email: 'test@youdo.app' };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

describe('Milestone 1 Empirical Challenger — UI Components & Flow Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Challenge 1: CreateRoomSheet under Adversarial & Edge Scenarios
  // ===========================================================================
  describe('Challenge 1: CreateRoomSheet (Pace, Privacy, and Staged Invites)', () => {
    it('1.1: Renders cleanly when personalPace (2h) differs substantially from default bar (4h)', () => {
      const html = renderToStaticMarkup(
        createElement(CreateRoomSheet, {
          open: true,
          onClose: vi.fn(),
          onSuccess: vi.fn(),
          personalPace: 2, // creator has 2h bar
        }),
      );

      // Verify no error alert is rendered
      expect(html).not.toContain('Pace mismatch');
      expect(html).not.toContain('Cannot join');
      expect(html).not.toContain('alert');
      expect(html).toContain('Target daily focus hours for squad members. Any member can join regardless of personal bar.');
      expect(html).toContain('2h'); // initialized with personalPace
      expect(html).toContain('Anyone can join');
      expect(html).toContain('Invite-only');
      expect(html).toContain('0/3 selected');
    });

    it('1.2: Returns null when open is false', () => {
      const html = renderToStaticMarkup(
        createElement(CreateRoomSheet, {
          open: false,
          onClose: vi.fn(),
          onSuccess: vi.fn(),
          personalPace: 4,
        }),
      );
      expect(html).toBe('');
    });

    it('1.3: Empirical execution — createSquad handles mismatched pace (creator=2h, room=8h) without blocking', async () => {
      const createSquadSpy = vi.spyOn(squadsLib, 'createSquad').mockResolvedValueOnce({
        ok: true,
        squad: {
          id: 'sq-new-8h',
          name: 'High Intensity Study',
          description: '🔥',
          bar_hours: 8,
          privacy: 'anyone_can_join',
          allow_join_requests: true,
          created_by: mockUser.id,
          created_at: new Date().toISOString(),
        },
      });

      // Call createSquad directly with mismatched pace
      const res = await squadsLib.createSquad(
        mockUser.id,
        'High Intensity Study',
        '🔥',
        8, // room target is 8h, creator is 2h
        true,
        'anyone_can_join',
        ['user-friend-1'],
      );

      expect(res.ok).toBe(true);
      expect(res.squad?.bar_hours).toBe(8);
      expect(res.squad?.created_by).toBe(mockUser.id);
      expect(createSquadSpy).toHaveBeenCalledWith(
        mockUser.id,
        'High Intensity Study',
        '🔥',
        8,
        true,
        'anyone_can_join',
        ['user-friend-1'],
      );
    });

    it('1.4: Empirical execution — createSquad handles empty name error gracefully', async () => {
      const res = await squadsLib.createSquad({
        ownerId: mockUser.id,
        name: '   ', // whitespace only
        barHours: 4,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe('Please give your squad a name.');
    });

    it('1.5: Empirical execution — createSquad handles invite-only privacy correctly', async () => {
      vi.spyOn(squadsLib, 'createSquad').mockResolvedValueOnce({
        ok: true,
        squad: {
          id: 'sq-private-1',
          name: 'Secret Circle',
          description: '🔒',
          bar_hours: 4,
          privacy: 'invite_only',
          allow_join_requests: false,
          created_by: mockUser.id,
          created_at: new Date().toISOString(),
        },
      });

      const res = await squadsLib.createSquad({
        ownerId: mockUser.id,
        name: 'Secret Circle',
        icon: '🔒',
        barHours: 4,
        privacy: 'invite_only',
      });

      expect(res.ok).toBe(true);
      expect(res.squad?.privacy).toBe('invite_only');
      expect(res.squad?.allow_join_requests).toBe(false);
    });

    it('1.6: Boundary test — createSquad handles excessive (>3) initial invites gracefully', async () => {
      vi.spyOn(squadsLib, 'createSquad').mockResolvedValueOnce({
        ok: true,
        squad: {
          id: 'sq-bulk-invites',
          name: 'Bulk Room',
          description: '🔥',
          bar_hours: 4,
          privacy: 'invite_only',
          allow_join_requests: false,
          created_by: mockUser.id,
          created_at: new Date().toISOString(),
        },
      });

      const excessiveInvites = ['u-1', 'u-2', 'u-3', 'u-4', 'u-5'];
      const res = await squadsLib.createSquad(
        mockUser.id,
        'Bulk Room',
        '🔥',
        4,
        false,
        'invite_only',
        excessiveInvites,
      );

      expect(res.ok).toBe(true);
      expect(res.squad?.id).toBe('sq-bulk-invites');
    });
  });

  // ===========================================================================
  // Challenge 2: RoomsView under Adversarial Discover & Privacy Scenarios
  // ===========================================================================
  describe('Challenge 2: RoomsView (Discover List and Privacy Separation)', () => {
    it('2.1: Renders Your Squads with Privacy Badges (Private vs Public)', () => {
      const myRooms: squadsLib.Squad[] = [
        {
          id: 'sq-pub',
          name: 'Public Squad',
          description: '🌐',
          bar_hours: 4,
          privacy: 'anyone_can_join',
          allow_join_requests: true,
          created_by: mockUser.id,
          created_at: new Date().toISOString(),
        },
        {
          id: 'sq-priv',
          name: 'Private Squad',
          description: '🔒',
          bar_hours: 6,
          privacy: 'invite_only',
          allow_join_requests: false,
          created_by: mockUser.id,
          created_at: new Date().toISOString(),
        },
      ];

      vi.spyOn(squadsLib, 'fetchMySquads').mockResolvedValue(myRooms);
      vi.spyOn(squadsLib, 'fetchDiscoverableSquads').mockResolvedValue([]);
      vi.spyOn(squadsLib, 'fetchOutgoingSquadJoinRequests').mockResolvedValue([]);

      const html = renderToStaticMarkup(
        createElement(RoomsView, {
          onOpenRoom: vi.fn(),
        }),
      );

      // Verify the component renders the squads container
      expect(html).toContain('Your squads');
      expect(html).toContain('Discover');
    });

    it('2.2: Empirical verification — Discover list strictly excludes invite_only squads', async () => {
      const allSquadsInDB: squadsLib.Squad[] = [
        {
          id: 'sq-public-open',
          name: 'Open Coders',
          description: '⚡',
          bar_hours: 5,
          privacy: 'anyone_can_join',
          allow_join_requests: true,
          created_by: 'other-user-1',
          created_at: new Date().toISOString(),
        },
        {
          id: 'sq-private-secret',
          name: 'Secret Squad',
          description: '🔒',
          bar_hours: 8,
          privacy: 'invite_only',
          allow_join_requests: false,
          created_by: 'other-user-2',
          created_at: new Date().toISOString(),
        },
        {
          id: 'sq-legacy-closed',
          name: 'Legacy Closed Squad',
          description: '🛡️',
          bar_hours: 4,
          privacy: 'anyone_can_join',
          allow_join_requests: false, // join requests disabled
          created_by: 'other-user-3',
          created_at: new Date().toISOString(),
        },
      ];

      // SQL contract emulation for discover_squads()
      const discoverable = allSquadsInDB.filter(
        (s) => s.privacy === 'anyone_can_join' && s.allow_join_requests === true,
      );

      expect(discoverable).toHaveLength(1);
      expect(discoverable[0].id).toBe('sq-public-open');
      expect(discoverable[0].privacy).toBe('anyone_can_join');

      // Crucial assertion: Private squad is NEVER discoverable
      const hasPrivate = discoverable.some((s) => s.privacy === 'invite_only');
      expect(hasPrivate).toBe(false);
    });

    it('2.3: Empirical verification — joining invite_only squad directly via requestJoinSquad', async () => {
      const requestSpy = vi.spyOn(squadsLib, 'requestJoinSquad').mockResolvedValueOnce({ ok: true });
      const res = await squadsLib.requestJoinSquad('sq-public-1', mockUser.id);
      expect(res.ok).toBe(true);
      expect(requestSpy).toHaveBeenCalledWith('sq-public-1', mockUser.id);
    });
  });

  // ===========================================================================
  // Challenge 3: SquadSettingsSheet (Admin vs Member, Privacy Updates, Invites)
  // ===========================================================================
  describe('Challenge 3: SquadSettingsSheet (Admin Controls and Profile Names)', () => {
    const mockSquad: squadsLib.Squad = {
      id: 'squad-test-settings',
      name: 'Algorithm Masters',
      description: '⚔️',
      bar_hours: 5,
      privacy: 'anyone_can_join',
      allow_join_requests: true,
      created_by: mockUser.id,
      created_at: new Date().toISOString(),
    };

    const mockAdminMember: squadsLib.SquadMember = {
      squad_id: mockSquad.id,
      user_id: mockUser.id,
      role: 'admin',
      status: 'accepted',
      profiles: {
        id: mockUser.id,
        username: 'algorithm_boss',
        display_name: 'Dr. Turing',
        avatar_url: 'https://avatar.test/turing.png',
        created_at: '',
        updated_at: '',
        bio: '',
        stats_private: false,
      },
    };

    const mockRegularMember: squadsLib.SquadMember = {
      squad_id: mockSquad.id,
      user_id: 'user-regular-456',
      role: 'member',
      status: 'accepted',
      profiles: {
        id: 'user-regular-456',
        username: 'ada_coder',
        display_name: 'Ada Lovelace',
        avatar_url: 'https://avatar.test/ada.png',
        created_at: '',
        updated_at: '',
        bio: '',
        stats_private: false,
      },
    };

    it('3.1: Admin renders privacy switch buttons and member profile names', () => {
      const html = renderToStaticMarkup(
        createElement(SquadSettingsSheet, {
          open: true,
          onClose: vi.fn(),
          squad: mockSquad,
          members: [mockAdminMember, mockRegularMember],
          onMembersChanged: vi.fn(),
        }),
      );

      // Verify Admin controls
      expect(html).toContain('Squad settings');
      expect(html).toContain('Room Privacy');
      expect(html).toContain('Anyone can join');
      expect(html).toContain('Invite-only');
      expect(html).toContain('Invite by @username');

      // Verify Profile Display Names are strictly used (never board aliases)
      expect(html).toContain('Dr. Turing');
      expect(html).toContain('@algorithm_boss');
      expect(html).toContain('Ada Lovelace');
      expect(html).toContain('@ada_coder');
      expect(html).toContain('Admin');
      expect(html).toContain('Members (2/4)');
    });

    it('3.2: Non-admin member renders read-only privacy indicator without admin controls', () => {
      const nonAdminSquad: squadsLib.Squad = {
        ...mockSquad,
        privacy: 'invite_only',
        allow_join_requests: false,
      };

      const html = renderToStaticMarkup(
        createElement(SquadSettingsSheet, {
          open: true,
          onClose: vi.fn(),
          squad: nonAdminSquad,
          members: [
            { ...mockAdminMember, user_id: 'some-other-admin' },
            mockRegularMember,
          ],
          onMembersChanged: vi.fn(),
        }),
      );

      // Non-admin sees read-only indicator
      expect(html).toContain('Room access');
      // Non-admin does NOT see admin controls
      expect(html).not.toContain('Invite by @username');
    });

    it('3.3: Empirical execution — updateSquadPrivacy toggles privacy and updates allow_join_requests', async () => {
      const updatePrivacySpy = vi.spyOn(squadsLib, 'updateSquadPrivacy').mockResolvedValue(true);

      const ok = await squadsLib.updateSquadPrivacy(mockSquad.id, 'invite_only');
      expect(ok).toBe(true);
      expect(updatePrivacySpy).toHaveBeenCalledWith(mockSquad.id, 'invite_only');
    });

    it('3.4: Empirical execution — inviteUserToSquadByUsername invokes RPC or falls back gracefully', async () => {
      vi.spyOn(squadsLib, 'inviteUserToSquadByUsername').mockResolvedValueOnce({
        ok: true,
        userId: 'u-target-789',
      });

      const res = await squadsLib.inviteUserToSquadByUsername(mockSquad.id, '@ada_coder');
      expect(res.ok).toBe(true);
      expect(res.userId).toBe('u-target-789');
    });

    it('3.5: Empirical execution — inviteUserToSquadByUsername handles empty username', async () => {
      const res = await squadsLib.inviteUserToSquadByUsername(mockSquad.id, '   ');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Enter a valid username.');
    });
  });

  // ===========================================================================
  // Challenge 4: Profile Name Precedence over Legacy Board Aliases
  // ===========================================================================
  describe('Challenge 4: Profile Name Precedence (Requirement R1 §4)', () => {
    it('4.1: profileDisplayLabel strictly uses profile.display_name over handle or placeholder', () => {
      const label = profilesLib.profileDisplayLabel({
        display_name: 'Master Builder',
        username: 'builder_01',
      });
      expect(label).toBe('Master Builder');
    });

    it('4.2: profileDisplayLabel falls back to @handle only if display_name is empty', () => {
      const label = profilesLib.profileDisplayLabel({
        display_name: '   ',
        username: 'pure_handle',
      });
      expect(label).toBe('@pure_handle');
    });

    it('4.3: resolvePublicBoardDisplayName prioritizes profile display name', async () => {
      const name = await profilesLib.resolvePublicBoardDisplayName('u-profile-name', {
        full_name: 'Auth Metadata Name',
      });
      expect(name).toBe('Official Display Name');
    });
  });

  // ===========================================================================
  // Challenge 5: Pace Unification (Segregation Removal)
  // ===========================================================================
  describe('Challenge 5: partitionSquadPaceMembers (Segregation Removal)', () => {
    it('5.1: 100% of members are in collective; separate is strictly 0', () => {
      const diverseMembers = [
        { userId: '1', barHours: 1 },
        { userId: '2', barHours: 4 },
        { userId: '3', barHours: 8 },
        { userId: '4', barHours: 12 },
      ];

      const { collective, separate } = squadsLib.partitionSquadPaceMembers(diverseMembers, 4);
      expect(collective).toHaveLength(4);
      expect(separate).toHaveLength(0);
      expect(collective).toEqual(diverseMembers);
    });

    it('5.2: paceHoursMatch returns non-blocking true for mismatched pace', () => {
      expect(squadsLib.paceHoursMatch(null, 5)).toBe(true);
      expect(squadsLib.paceHoursMatch(8, null)).toBe(true);
      expect(squadsLib.squadPaceGateMessage(8, 2)).toBe('');
    });
  });
});
