import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PUSH_SECRET_HEADER, isAuthorizedCaller, isStaleTokenError, parsePushRequest } from './guard.ts';

// Called only by the database through pg_net (supabase/push_dispatch.sql),
// which sends the shared PUSH_WEBHOOK_SECRET. Apps never call this function:
// a client could otherwise send any text to any user.

// In-memory token cache to prevent repeated OAuth token exchanges
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function pemToBinary(pem: string): Uint8Array {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(str: string | Uint8Array): string {
  let b64: string;
  if (typeof str === 'string') {
    b64 = btoa(unescape(encodeURIComponent(str)));
  } else {
    let binary = '';
    for (let i = 0; i < str.length; i++) {
      binary += String.fromCharCode(str[i]);
    }
    b64 = btoa(binary);
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < tokenExpiresAt - 60) {
    return cachedAccessToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  const keyBytes = pemToBinary(serviceAccount.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    )
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(signatureBytes)}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = now + (tokenData.expires_in || 3600);
  return cachedAccessToken;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
    }

    if (!isAuthorizedCaller(request.headers.get(PUSH_SECRET_HEADER), Deno.env.get('PUSH_WEBHOOK_SECRET'))) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const parsed = parsePushRequest(await request.json().catch(() => null));
      if (!parsed.ok) {
        return Response.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      const payload = parsed.request;

      // Read Firebase service account from environment secret
      const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (!serviceAccountJson) {
        return Response.json(
          { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT secret is not configured' },
          { status: 500 }
        );
      }

      // Parse errors can quote the secret, so report only that it is malformed.
      let serviceAccount: { client_email: string; private_key: string; project_id?: string };
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
      } catch {
        return Response.json(
          { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the downloaded key file through the dashboard.' },
          { status: 500 }
        );
      }
      const projectId = serviceAccount.project_id || 'youdo-aspirants-app';

      // Supabase admin client to query user_push_tokens
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: tokenRows, error: tokenError } = await supabase
        .from('user_push_tokens')
        .select('user_id, token')
        .in('user_id', payload.userIds);

      if (tokenError || !tokenRows || tokenRows.length === 0) {
        return Response.json({ ok: true, sent: 0, reason: 'No registered push tokens found' });
      }

      const accessToken = await getGoogleAccessToken(serviceAccount);

      let successCount = 0;
      const staleTokens: string[] = [];

      for (const row of tokenRows) {
        // A silent push carries data only, so Android shows nothing and the app
        // refreshes its widgets (live room dots) in the background.
        const messagePayload = payload.silent ? {
          message: { token: row.token, data: payload.data, android: { priority: 'high' } },
        } : {
          message: {
            token: row.token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data,
            android: {
              priority: 'high',
              notification: {
                channel_id: payload.channel,
                sound: 'default',
                // Same tag = the notification is updated in place (one per chat).
                ...(payload.data.tag ? { tag: payload.data.tag.slice(0, 64) } : {}),
              },
            },
          },
        };

        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messagePayload),
          }
        );

        if (fcmResponse.ok) {
          successCount++;
        } else {
          const errBody = await fcmResponse.json().catch(() => ({}));
          if (isStaleTokenError(fcmResponse.status, errBody)) {
            staleTokens.push(row.token);
          }
        }
      }

      // Cleanup any stale/unregistered device tokens automatically
      if (staleTokens.length > 0) {
        await supabase.from('user_push_tokens').delete().in('token', staleTokens);
      }

      return Response.json({
        ok: true,
        sent: successCount,
        totalTokens: tokenRows.length,
        cleaned: staleTokens.length,
      });
    } catch (error) {
      console.error('send-push failed:', error);
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Push failed' },
        { status: 500 }
      );
    }
  },
};
