import type { CommunityAuditEntry } from './community';

/**
 * Plain-language lines for the Admin Hub's activity log. Kept apart from
 * community.ts so the first screen doesn't load them.
 */
export interface CommunityAuditDescription {
  category: 'Settings' | 'Member' | 'Report' | 'Appeal' | 'Message' | 'Admin' | 'Staff' | 'Account';
  title: string;
  detail: string;
}

const auditSubject = (targetName?: string) => targetName?.trim() || 'a board member';

export function describeCommunityAudit(entry: CommunityAuditEntry, targetName?: string): CommunityAuditDescription {
  const subject = auditSubject(targetName);
  const descriptions: Record<string, CommunityAuditDescription> = {
    'settings.room.enabled': { category: 'Settings', title: 'Community room opened', detail: 'Members can send messages and automatic notes again.' },
    'settings.room.disabled': { category: 'Settings', title: 'Community room paused', detail: 'New messages and automatic notes are paused.' },
    'settings.kudos.enabled': { category: 'Settings', title: 'Kudos enabled', detail: 'Members can recognise today’s top three again.' },
    'settings.kudos.disabled': { category: 'Settings', title: 'Kudos paused', detail: 'New recognition is temporarily unavailable.' },
    'settings.announcement.published': { category: 'Settings', title: 'Board announcement published', detail: 'The room announcement was added or replaced.' },
    'settings.announcement.cleared': { category: 'Settings', title: 'Board announcement cleared', detail: 'The room announcement was removed.' },
    'settings.announcement.pushed': { category: 'Settings', title: 'Board update sent as a notification', detail: entry.reason || 'Board members were notified.' },
    'settings.private_hub.enabled': { category: 'Settings', title: 'Private Hub opened', detail: 'Members can open friends, rooms and DMs.' },
    'settings.private_hub.disabled': { category: 'Settings', title: 'Private Hub closed', detail: 'Members see the under-development page; admins can still preview it.' },
    'settings.updated': { category: 'Settings', title: 'Community settings updated', detail: 'An earlier app version recorded this change without field details.' },
    'member.mute_24h': { category: 'Member', title: `Muted ${subject} for 24 hours`, detail: entry.reason || 'Posting access was temporarily paused.' },
    'member.mute_7d': { category: 'Member', title: `Muted ${subject} for 7 days`, detail: entry.reason || 'Posting access was temporarily paused.' },
    'member.ban': { category: 'Member', title: `Removed ${subject} from community`, detail: entry.reason || 'Community access was disabled; private workspace data was untouched.' },
    'member.restore': { category: 'Member', title: `Restored ${subject}`, detail: entry.reason || 'Community access was restored.' },
    'appeal.approve': { category: 'Appeal', title: `Approved ${subject}’s appeal`, detail: entry.reason || 'Community access was restored.' },
    'appeal.decline': { category: 'Appeal', title: `Declined ${subject}’s appeal`, detail: entry.reason || 'The restriction remains in place.' },
    'message.removed': { category: 'Message', title: `Removed ${subject}’s message`, detail: entry.reason || 'The message was removed from the community room.' },
    'report.dismissed': { category: 'Report', title: 'Report dismissed', detail: 'The report was reviewed and closed without restricting a member.' },
    'hashtag.request.waiting': { category: 'Admin', title: `Replied to ${subject}’s exam request`, detail: entry.reason || 'The request remains open.' },
    'hashtag.request.rejected': { category: 'Admin', title: `Rejected ${subject}’s exam request`, detail: entry.reason || 'The requested exam hashtag was not approved.' },
    'hashtag.created': { category: 'Admin', title: 'Approved an exam community', detail: entry.reason || 'A requested hashtag was created or reactivated.' },
    'hashtag.admin.created': { category: 'Admin', title: 'Added an exam hashtag', detail: entry.reason || 'A hashtag was added directly.' },
    'hashtag.admin.renamed': { category: 'Admin', title: 'Renamed an exam hashtag', detail: entry.reason || 'The display name changed for its members.' },
    'hashtag.admin.archived': { category: 'Admin', title: 'Deleted an exam hashtag', detail: entry.reason || 'The hashtag was removed from members and chat.' },
    'hashtag.admin.restored': { category: 'Admin', title: 'Restored an exam hashtag', detail: entry.reason || 'Members can select it again.' },
    'quotes.created': { category: 'Admin', title: 'Added an app quote', detail: entry.reason || 'A new motivational quote was added.' },
    'quotes.updated': { category: 'Admin', title: 'Edited an app quote', detail: entry.reason || 'A motivational quote was updated.' },
    'quotes.deleted': { category: 'Admin', title: 'Deleted an app quote', detail: entry.reason || 'A motivational quote was removed.' },
    'support.updated': { category: 'Admin', title: 'Changed Support settings', detail: entry.reason || 'The UPI ID or a Support switch changed.' },
    'photo.removed': { category: 'Member', title: `Removed ${subject}’s photo`, detail: 'They are back to the 🎓 emoji and can choose another.' },
    'staff.promote': { category: 'Staff', title: `Made ${subject} an admin`, detail: 'They can moderate, run hashtags and quotes, and look people up.' },
    'staff.demote': { category: 'Staff', title: `Removed ${subject} as admin`, detail: 'They are a member again.' },
    'staff.show_badge': { category: 'Staff', title: `Showed ${subject}’s Admin badge`, detail: 'Members see the badge on their name.' },
    'staff.hide_badge': { category: 'Staff', title: `Hid ${subject}’s Admin badge`, detail: 'They stay an admin without the badge.' },
    'email.sent': { category: 'Admin', title: 'Sent an email', detail: entry.reason || 'An email went out from the Admin Hub.' },
    'account.deleted': { category: 'Account', title: 'Deleted an account', detail: 'The account and everything saved with it were removed.' },
    'accounts.cleanup': { category: 'Account', title: `Cleaned up ${entry.reason || 'junk'} accounts`, detail: 'Unconfirmed or empty accounts were removed.' },
  };
  if (descriptions[entry.action]) return descriptions[entry.action];
  const readable = entry.action.split('.').filter(Boolean).join(' ');
  return {
    category: 'Admin',
    title: readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : 'Admin action recorded',
    detail: entry.reason || 'Recorded by a community administrator.',
  };
}
