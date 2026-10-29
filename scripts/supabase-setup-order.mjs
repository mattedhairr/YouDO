// The order in which supabase/*.sql builds a complete YouDO project from empty.
// Later files replace functions defined by earlier ones (for example the Private
// Hub setup extends board_pace_rows and prune_community_history), so this order
// matters. Not listed on purpose:
// - full_hub_rooms_rollback.sql: removes the Private Hub.
// - rooms_privacy_and_invites.sql: fully contained in full_hub_rooms_setup.sql.
// - cleanup_retired_private_hub.sql: one-off removal of the old Private Hub switch and waitlist.
// - profiles_hardening.sql: one-off patch for older projects; its changes are in the setup files.
// - add_pace_window_keys.sql, user_backup_snapshots.sql, dm_goal_share.sql: patches for old projects,
//   already part of their canonical setup files.
export const SUPABASE_SETUP_ORDER = [
  'user_backups',
  'cloud_backup_revisions',
  'public_pace',
  'community',
  'community_chat',
  'community_hashtags',
  'community_hashtag_admin',
  'app_quotes',
  'board_evidence',
  'community_rooms',
  'account_sessions',
  'full_hub_rooms_setup',
  'hub_room_membership',
  'hub_focus_status',
  'hub_room_focus',
  'hub_backers',
  'user_push_tokens',
  'push_dispatch',
  'hub_push',
  'hub_widget_push',
  'optimize_auth_rls_policies',
];
