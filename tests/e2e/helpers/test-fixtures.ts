/**
 * E2E Test Fixtures & Simulation Helpers for YouDO Rooms & Hub Refactor
 * Implements opaque-box requirement models and contracts defined in
 * ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
 */

export type RoomPrivacy = 'anyone_can_join' | 'invite_only';
export type SquadMemberStatus = 'accepted' | 'invited' | 'pending';
export type SquadMemberRole = 'admin' | 'member';
export type FocusWindow = 'today' | 'week' | 'month';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  stats_private?: boolean;
  avatar_url?: string;
}

export interface RoomSquad {
  id: string;
  name: string;
  description: string;
  bar_hours: number;
  privacy: RoomPrivacy;
  allow_join_requests: boolean;
  created_by: string;
  created_at: string;
}

export interface RoomSquadMember {
  squad_id: string;
  user_id: string;
  role: SquadMemberRole;
  status: SquadMemberStatus;
  joined_at: string;
  profiles: UserProfile | null;
}

export interface MemberProgress {
  userId: string;
  name: string;
  avatarUrl?: string;
  percentRaw: number;
  percent: number; // capped at 100
  isComplete: boolean;
  hoursDone: number;
  targetHours: number;
  overHours: number;
}

export interface CapsuleRenderNode {
  userId: string;
  name: string;
  percent: number;
  isComplete: boolean;
  mergedWithAbove: boolean;
  hasBorderTop: boolean;
  accentClass: string;
}

// -----------------------------------------------------------------------------
// R1: Room Settings, Invites, and Validation Contracts
// -----------------------------------------------------------------------------

/** Validates room creation without bar hours equality constraint */
export function validateRoomCreation(params: {
  name: string;
  barHours: number;
  privacy: RoomPrivacy;
  creatorPersonalPace: number;
}): { valid: boolean; error?: string } {
  if (!params.name || !params.name.trim()) {
    return { valid: false, error: 'Please give your squad a name.' };
  }
  if (params.barHours <= 0 || !Number.isFinite(params.barHours)) {
    return { valid: false, error: 'Daily target pace must be a positive number.' };
  }
  if (params.barHours > 24) {
    return { valid: false, error: 'Daily target pace cannot exceed 24 hours.' };
  }
  if (params.privacy !== 'anyone_can_join' && params.privacy !== 'invite_only') {
    return { valid: false, error: 'Invalid room privacy option.' };
  }
  // Note: Bar hour equality is intentionally NOT required
  return { valid: true };
}

/** Validates room join eligibility without personal streak/bar hour restriction */
export function validateRoomJoin(params: {
  squad: RoomSquad;
  userPersonalPace: number;
  userStatus?: SquadMemberStatus;
}): { canJoin: boolean; error?: string } {
  if (params.squad.privacy === 'invite_only') {
    if (params.userStatus !== 'invited') {
      return { canJoin: false, error: 'This room is invite-only. You must be invited by an admin.' };
    }
  }
  // Bar hours matching restriction is removed
  return { canJoin: true };
}

/** Username prefix search matching case-insensitively and normalizing '@' */
export function searchUsersByUsernamePrefix(
  profiles: UserProfile[],
  searchQuery: string,
  excludeUserId?: string,
): UserProfile[] {
  const clean = searchQuery.replace(/^@/, '').toLowerCase().trim();
  if (clean.length < 2) return [];
  return profiles.filter((p) => {
    if (excludeUserId && p.id === excludeUserId) return false;
    const handle = p.username.toLowerCase();
    return handle.startsWith(clean);
  });
}

/** Resolves public display name strictly using profile display name */
export function resolveDisplayName(profile: Pick<UserProfile, 'display_name' | 'username'> | null): string {
  if (!profile) return 'Member';
  const trimmed = profile.display_name?.trim();
  if (trimmed) return trimmed.slice(0, 40);
  const handle = profile.username?.trim();
  if (handle) return `@${handle}`;
  return 'Member';
}

// -----------------------------------------------------------------------------
// R2: Real-Time Sync & Routing Logic Contracts
// -----------------------------------------------------------------------------

export interface HubAttentionState {
  privatePending: number; // friendPending + squadInboxPending
  dmUnread: number;
  communityUnread: number;
  publicBoardOptedIn: boolean;
}

export function computeHubNotificationDot(state: HubAttentionState): boolean {
  const privateAttention = state.privatePending > 0 || state.dmUnread > 0;
  const publicAttention = state.publicBoardOptedIn && state.communityUnread > 0;
  return privateAttention || publicAttention;
}

export function resolveDefaultHubSubTab(state: HubAttentionState): 'social' | 'private' {
  // If private notification / invite is pending, prioritize routing to private tab
  if (state.privatePending > 0 || state.dmUnread > 0) {
    return 'private';
  }
  // Otherwise route according to public board preference
  return state.publicBoardOptedIn ? 'social' : 'private';
}

// -----------------------------------------------------------------------------
// R3: Stacked Capsule UI & Visual Merging Calculations
// -----------------------------------------------------------------------------

/** Computes stacked capsule nodes and calculates visual merging on 100% completion */
export function computeStackedCapsuleNodes(members: MemberProgress[]): CapsuleRenderNode[] {
  return members.map((m, index) => {
    const isComplete = m.percentRaw >= 100;
    const prevMember = index > 0 ? members[index - 1] : null;
    const prevComplete = prevMember ? prevMember.percentRaw >= 100 : false;
    // When a user completes their progress, visually merge with capsule above if both complete
    const mergedWithAbove = isComplete && prevComplete;
    return {
      userId: m.userId,
      name: m.name,
      percent: Math.min(100, Math.max(0, m.percentRaw)),
      isComplete,
      mergedWithAbove,
      hasBorderTop: index > 0 && !mergedWithAbove,
      accentClass: isComplete ? 'bg-secondary text-secondary' : 'bg-primary text-primary',
    };
  });
}

/** Generates clean minimal markup for stacked capsules with NO redundant % text and NO live board */
export function renderStackedCapsulesMarkup(nodes: CapsuleRenderNode[]): string {
  const capsuleElements = nodes
    .map(
      (n) =>
        `<div class="capsule-segment ${n.hasBorderTop ? 'border-t border-subtle' : 'merged-segment'}" data-user="${n.userId}">` +
        `<div class="capsule-fill ${n.accentClass}" style="height: ${n.percent}%;"></div>` +
        `</div>`,
    )
    .join('');

  const memberRows = nodes
    .map(
      (n, i) =>
        `<div class="member-row" data-user="${n.userId}">` +
        `<button type="button" class="dp-button" aria-label="Open profile for ${n.name}" data-userid="${n.userId}">` +
        `<span class="avatar">${n.name[0]}</span>` +
        `</button>` +
        `<div class="member-meta">` +
        `<span class="name">${i + 1}. ${n.name}</span>` +
        `<span class="status">${n.isComplete ? 'Bar reached' : 'In progress'}</span>` +
        `</div>` +
        `</div>`,
    )
    .join('');

  return (
    `<div class="stacked-capsule-board" role="region" aria-label="Room Progress">` +
    `<div class="capsule-track rounded-full">${capsuleElements}</div>` +
    `<div class="member-list">${memberRows}</div>` +
    `</div>`
  );
}

// -----------------------------------------------------------------------------
// R4: Redesigned Profile Card Markup (Sleek capsule switch, no <select>)
// -----------------------------------------------------------------------------

export function renderProfileCardMarkup(params: {
  profile: UserProfile;
  activeWindow: FocusWindow;
  streakDays: number;
  focusMs: number;
  formatDuration: (ms: number) => string;
}): string {
  const windows: FocusWindow[] = ['today', 'week', 'month'];
  const pillSwitch = windows
    .map(
      (w) =>
        `<button type="button" class="capsule-pill ${params.activeWindow === w ? 'active bg-primary text-on-primary' : 'bg-elevated'}" ` +
        `data-window="${w}" aria-pressed="${params.activeWindow === w}">` +
        `${w.charAt(0).toUpperCase() + w.slice(1)}` +
        `</button>`,
    )
    .join('');

  return (
    `<div class="user-profile-sheet" role="dialog" aria-label="User Profile">` +
    `<div class="profile-header">` +
    `<div class="avatar-large">${params.profile.display_name[0]}</div>` +
    `<h1 class="display-name">${params.profile.display_name}</h1>` +
    `<p class="username">@${params.profile.username}</p>` +
    (params.profile.bio ? `<p class="bio">${params.profile.bio}</p>` : '') +
    `</div>` +
    `<div class="focus-stats-section">` +
    `<div class="stats-header">` +
    `<span class="title">Focus Stats</span>` +
    `<div class="capsule-switch-dock rounded-full border border-subtle" role="radiogroup" aria-label="Time window selector">` +
    pillSwitch +
    `</div>` +
    `</div>` +
    (params.profile.stats_private
      ? `<div class="stats-private-locked">This user keeps their stats private</div>`
      : `<div class="stats-grid">` +
        `<div class="stat-card streak"><span class="val">${params.streakDays} days</span></div>` +
        `<div class="stat-card focus"><span class="val">${params.formatDuration(params.focusMs)}</span></div>` +
        `</div>`) +
    `</div>` +
    `</div>`
  );
}

// -----------------------------------------------------------------------------
// Supabase Migration Mock & DDL Inspector
// -----------------------------------------------------------------------------

export interface MigrationDDLCheck {
  hasPrivacyColumn: boolean;
  hasPrivacyCheckConstraint: boolean;
  hasInvitedMemberStatus: boolean;
  hasInvitedSelectPolicy: boolean;
  hasInvitedInsertPolicy: boolean;
  isIdempotent: boolean;
}

export function parseAndValidateMigrationSQL(sqlContent: string): MigrationDDLCheck {
  return {
    hasPrivacyColumn: /privacy\s+text/i.test(sqlContent) || /alter\s+table.*add\s+column.*privacy/i.test(sqlContent),
    hasPrivacyCheckConstraint:
      /check\s*\(\s*privacy\s+in\s*\(\s*'anyone_can_join'\s*,\s*'invite_only'\s*\)\s*\)/i.test(sqlContent),
    hasInvitedMemberStatus: /check\s*\(.*'invited'.*\)/i.test(sqlContent) || /status.*'invited'/i.test(sqlContent),
    hasInvitedSelectPolicy:
      /create\s+policy[\s\S]*?squad[\s\S]*?for\s+select/i.test(sqlContent) && /invited/i.test(sqlContent),
    hasInvitedInsertPolicy:
      /create\s+policy[\s\S]*?squad_members[\s\S]*?for\s+insert/i.test(sqlContent),
    isIdempotent:
      /if\s+not\s+exists/i.test(sqlContent) || /create\s+or\s+replace/i.test(sqlContent),
  };
}
