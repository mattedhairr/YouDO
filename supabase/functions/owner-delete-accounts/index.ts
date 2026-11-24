import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';

type PhotoBucket = {
  list: (path: string, options: { limit: number }) => Promise<{ data: { name: string }[] | null }>;
  remove: (paths: string[]) => Promise<unknown>;
};

/** Removes someone's uploaded profile photos (avatars/<id>/…), which deleting the account would leave behind. */
async function removePhotos(admin: { storage: { from: (bucket: string) => PhotoBucket } }, id: string): Promise<void> {
  const bucket = admin.storage.from('avatars');
  const { data } = await bucket.list(id, { limit: 100 });
  const paths = (data ?? []).map((file) => `${id}/${file.name}`);
  if (paths.length) await bucket.remove(paths);
}

/**
 * Deletes accounts for the owner, from the Admin Hub.
 *
 * The ids come from owner_accounts_to_delete() (supabase/admin_hub.sql), called
 * as the signed-in person, so only the owner gets any and the rules are checked
 * again at this moment. Each account is then deleted with Supabase Auth's own
 * delete, which clears every table that cascades from auth.users.
 *
 * Body: { mode: 'chosen', ids } for the accounts ticked in Account cleanup
 *       (owner_chosen_accounts_to_delete() keeps only those the rules still allow),
 *       { mode: 'all', expectedCount } for the whole junk list, or
 *       { mode: 'one', target, typed } for one person (typed = their @username).
 * Their profile photos are removed from Storage first.
 */
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
    }
    try {
      const body = await request.json().catch(() => null) as
        { mode?: string; expectedCount?: number; target?: string; typed?: string; ids?: unknown } | null;
      const mode = body?.mode === 'one' ? 'one' : body?.mode === 'all' ? 'all' : body?.mode === 'chosen' ? 'chosen' : null;
      if (!mode) return Response.json({ ok: false, error: 'Nothing to delete.' }, { status: 400 });
      const chosen = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];

      const { data: ids, error: listError } = mode === 'chosen'
        ? await context.supabase.rpc('owner_chosen_accounts_to_delete', { chosen })
        : await context.supabase.rpc('owner_accounts_to_delete', {
          delete_mode: mode,
          expected_count: mode === 'all' ? Number(body?.expectedCount ?? -1) : null,
          target: mode === 'one' ? body?.target ?? null : null,
          typed: body?.typed ?? '',
        });
      if (listError) {
        return Response.json({ ok: false, error: listError.message }, { status: 403 });
      }

      let deleted = 0;
      const failed: string[] = [];
      for (const id of (ids ?? []) as string[]) {
        await removePhotos(context.supabaseAdmin, id).catch((error) => console.warn('photo cleanup skipped', error));
        const { error } = await context.supabaseAdmin.auth.admin.deleteUser(id, false);
        if (error) failed.push(error.message);
        else deleted += 1;
      }
      await context.supabase.rpc('owner_log_deletion', { deleted, delete_mode: mode });
      const skipped = mode === 'chosen' ? Math.max(0, chosen.length - ((ids ?? []) as string[]).length) : 0;
      return Response.json({ ok: failed.length === 0, deleted, skipped, failed: failed.length, error: failed[0] ?? null });
    } catch (error) {
      console.error('owner-delete-accounts failed', error);
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Deleting failed.' },
        { status: 500 },
      );
    }
  }),
};
