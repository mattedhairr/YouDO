import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
    }

    try {
      const body = await request.json().catch(() => null) as { confirmation?: string } | null;
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

      const { error: deleteError } = await context.supabaseAdmin.auth.admin.deleteUser(
        userData.user.id,
        false,
      );
      if (deleteError) throw deleteError;

      return Response.json({ ok: true });
    } catch (error) {
      console.error('delete-account failed', error);
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Account deletion failed.' },
        { status: 500 },
      );
    }
  }),
};
