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

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
    }

    try {
      const body = await request.json().catch(() => null) as { confirmation?: string; expectedAccountId?: string } | null;
      if (body?.confirmation !== 'DELETE') {
        return Response.json(
          { ok: false, error: 'Deletion confirmation is missing.' },
          { status: 400 },
        );
      }

      const { data: userData, error: userError } = await context.supabase.auth.getUser();
      if (userError || !userData.user) {
        return Response.json(
          { ok: false, error: 'Your session is no longer valid. Sign in again.' },
          { status: 401 },
        );
      }

      if (body.expectedAccountId && userData.user.id !== body.expectedAccountId) {
        return Response.json(
          { ok: false, error: 'The signed-in account changed. Nothing was deleted.' },
          { status: 409 },
        );
      }

      await removePhotos(context.supabaseAdmin, userData.user.id).catch((error) => console.warn('photo cleanup skipped', error));
      const { error: deleteError } = await context.supabaseAdmin.auth.admin.deleteUser(
        userData.user.id,
        false,
      );
      if (deleteError) throw deleteError;

      return Response.json({ ok: true, accountId: userData.user.id });
    } catch (error) {
      console.error('delete-account failed', error);
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Account deletion failed.' },
        { status: 500 },
      );
    }
  }),
};
