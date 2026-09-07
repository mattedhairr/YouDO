# YouDO account confirmation — deployment checklist

This setup uses the existing website, **https://tu-do-psi.vercel.app**. It does not require another account, domain, or mobile reinstall to open a confirmation email.

## 1. Deploy the page first

Deploy the reviewed branch to the production Vercel site using your normal release process. The Vite build now produces both the app and `/auth-confirm.html`.

Open **https://tu-do-psi.vercel.app/auth-confirm.html** on a phone. Without a confirmation link, it should say “Check your account in YouDO”, not show the sign-in screen or a connection error. Do not send new test links until this page is reachable.

If the project has a custom Vercel catch-all rewrite, make sure it does not replace this real HTML file with the app’s index page. A normal Vite deployment serves the generated file directly.

## 2. Configure Supabase

Open **Authentication → URL Configuration**:

1. Set **Site URL** to `https://tu-do-psi.vercel.app/auth-confirm.html`. This also gives older clients that do not specify a redirect a reachable destination.
2. Add that **exact same URL** to **Redirect URLs**.
3. Save changes. Do not use localhost as the production Site URL.

Keep **Confirm email** enabled under the signup configuration, and **Secure email change** enabled under the Email provider. Email-template editors change message wording; they are not these switches. Keep the standard `{{ .ConfirmationURL }}` verification link in signup and change-email templates: do not replace it with a plain website link.

If you customize or fork the deployment, set `VITE_AUTH_REDIRECT_URL` to your own deployed HTTPS confirmation page in Vercel and the Android build environment, then rebuild. The current project defaults to the address above. Never place a service-role key in frontend configuration.

Reference: [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 3. Test with an account you control

1. Confirm that you can open both the current and replacement inbox. Keep a JSON backup of any valuable workspace.
2. In the new YouDO build, open **Settings → Account security → Change email**.
3. Submit the new email and current password once.
4. Open the latest confirmation link from each inbox. Either order is fine. Do not reuse earlier requests.
5. After the first confirmation, the page may ask you to check the other inbox.
6. Return to YouDO. Refresh the account view and verify the new address; sign in with it if an older device still displays the previous cached email.
7. Confirm goals, tasks, and focus history still belong to the same account.

Test signup confirmation separately with a disposable account. Password recovery and passwordless sign-in are not implemented by this page.

## What the page does—and does not do

- Recognizes expired links, errors, and a first-inbox acknowledgement.
- Scrubs callback parameters from the address bar without logging or storing them.
- Does not create an app session, mount the workspace, or perform a cloud sync.
- Does not claim a completed email change merely because someone opened the page. The account shown in YouDO remains the final check.
- Does not automatically log out every other device or change Supabase’s session policies.

Deployment and dashboard changes are separate from local code verification. Record a successful two-inbox test before declaring the mobile flow release-ready.
