# Signed-in devices setup

YouDO shows Supabase Auth sessions under **Settings → Account security → Signed-in devices**. It displays a broad device type, client, and last activity without exposing IP addresses.

## Install

1. In Supabase, open **SQL Editor** and create a private query named **YouDO — Account Sessions**.
2. Copy the complete contents of `supabase/account_sessions.sql` into the query. Do not run only a selected section.
3. Save the query, then run it once. A successful result returns no rows. The script is transactional and safe to rerun.
4. Deploy the matching YouDO build, open **Signed-in devices**, and refresh.

## Security behavior

- Only the signed-in account can list its own sessions; IP addresses and token values are never returned.
- The current device cannot revoke itself from this screen.
- Remote sign-out is allowed only after the current session is at least 24 hours old. This trust check is enforced in PostgreSQL, not only by the disabled button.
- Revoking one session deletes only that owned session. Its refresh token can no longer renew access, but an already-issued access token can remain usable until its normal expiry.
- The device labels are intentionally broad because browser user-agent strings are not reliable device names. A session count is more accurate than claiming a precise physical-device count.

Test with controlled accounts before release: sign in on two browsers, confirm both sessions appear, confirm a new session cannot revoke, then use an account session older than 24 hours to revoke the other browser and wait through the access-token expiry window.
