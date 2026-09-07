import { confirmationStatus } from './lib/authRedirect';
import './authConfirmation.css';

// This entry deliberately never imports auth, the app, or the workspace store.
// A confirmation click on another device must not start a sync or replace a session.
const status = confirmationStatus(window.location.hash, window.location.search);
window.history.replaceState(null, '', window.location.pathname);
const copy = {
  expired: ['This link has expired', 'It may already have been used. Check your email in YouDO first. If the change is still pending, request fresh links and use the latest email in each inbox.'],
  error: ['Confirmation could not finish', 'Return to YouDO and check your account email. If the change is still pending, request a new confirmation email.'],
  pending: ['One more inbox to check', 'Your confirmation link was accepted. Open the latest confirmation email in your other inbox, then return to YouDO to check the change.'],
  received: ['Confirmation received', 'Return to YouDO to check your account email. If you requested an email change, make sure you have confirmed the latest link in both inboxes.'],
  unknown: ['Check your account in YouDO', 'This page cannot verify the result of your link. Return to YouDO and check your account email before requesting another confirmation.'],
} as const;
document.getElementById('confirmation-title')!.textContent = copy[status][0];
document.getElementById('confirmation-detail')!.textContent = copy[status][1];
