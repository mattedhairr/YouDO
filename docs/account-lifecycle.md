# Account lifecycle and workspace ownership

The Supabase Auth user ID owns the cloud backup, restore points, and signed-in device sessions. The saved device workspace has one owner ID. Authentication alone does not replace that workspace: the gate checks ownership before opening private data.

| Transition | Device workspace | Cloud account | Required boundary |
| --- | --- | --- | --- |
| New signup awaiting email verification | Existing copy remains closed or available in explicit offline mode | Pending user has no signed-in workspace | A signup response without a session does not claim the device copy. |
| Sign in to the same account | Keep its owned copy | Fetch only that account's backup | Owner ID must match before private views open. |
| Sign in to another account | Preserve the previous copy until an explicit choice | Fetch only the new account's backup | Never combine or upload the previous owner's data. |
| Sign out in Settings | Clear the signed-out account's device copy through a recoverable checkpoint | Cloud copy stays | Sync must succeed; an active sitting or changed device copy blocks clearing. |
| Profile name or avatar edit | No workspace replacement | Update only the account whose token was captured when editing began | Response user ID must match; a later account switch cannot retarget the write. |
| Password reset link | No workspace replacement until normal sign-in gate completes | Change password for the verified recovery account | The URL marker alone grants nothing; a Supabase `PASSWORD_RECOVERY` event and matching token are required. |
| Signed-in device list or remote revocation | No workspace replacement | Only the authenticated account's sessions | The UI checks account identity before and after RPC; the server enforces ownership and the current-session restriction. |
| Delete account | Keep the device copy until server confirmation | Delete only the authenticated, confirmed user ID | A captured token and expected user ID bind the request. A changed account or failed device checkpoint keeps the device copy closed for review. |

Deletion is irreversible. Do not run its hosted test against the maintainer's personal account or the shared YouDO Tester account while another batch depends on it. Use a separate disposable account and verify that its backup and sessions disappear while another controlled account remains unchanged.

The updated `delete-account` function returns the deleted account ID. Deploy it before distributing a client that requires this response. Its expected-account field is optional for older clients; new clients send it and reject a mismatched response. The existing SQL session functions remain unchanged.

## Release verification still required

1. Use separate disposable accounts A and B on distinct browser origins. Verify same-account sign-in and explicit switch choices without moving either account's workspace into the other.
2. Start a Settings sign-out after a successful sync, then simulate a local write or storage failure before the clear. Confirm the saved owner and data remain recoverable. An active sitting must block sign-out and deletion.
3. In A, edit name/avatar and initiate a password reset. A forged `?auth=recovery` URL in an ordinary signed-in session must not allow a password change. A valid reset link must change only A's password; B's credentials and workspace must remain intact.
4. List and revoke controlled remote sessions. Confirm an account cannot list or revoke another account's sessions. A revoked session may remain usable until its access token expires; verify it cannot renew afterward.
5. Delete only a dedicated disposable account. Check server response ID, fresh sign-in failure, removed cloud rows, and device-owner cleanup. Confirm B's data survives.
6. Repeat the ownership and sign-out checks on Android through an install-over. Keep the Batch 6 overnight gate separate until its result is known.
