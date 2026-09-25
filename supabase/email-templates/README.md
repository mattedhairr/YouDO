# Hosted YouDO Auth email templates

Set these in Supabase Dashboard → Authentication → Emails → Templates.

| Template | Subject | Source file |
| --- | --- | --- |
| Confirm sign up | Confirm your YouDO email | `confirm-sign-up.html` |
| Reset password | Reset your YouDO password | `reset-password.html` |
| Change email address | Confirm your YouDO email change | `change-email-address.html` |

Keep `{{ .ConfirmationURL }}` in all three templates. It carries the Supabase verification or recovery token and uses the configured redirect. `{{ .NewEmail }}` is supported in the change-email template. The Y icon is served from the production website, with `ouDO` beside it to form the app wordmark. Its `alt="Y"` text keeps the name readable if remote images are blocked. The production redirect allowlist is documented in `docs/account-links.md`. A repository file alone does not update the hosted template; verify the dashboard content and test delivery with a disposable account after applying it.
