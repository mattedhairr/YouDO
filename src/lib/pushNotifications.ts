import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type ActionPerformed,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import { supabase } from './supabase';
import { requestOpenCommunity, requestOpenDm } from '../components/hub/openDm';

let isInitialized = false;
// The FCM token of this device, known once registration has fired this session.
let deviceToken: string | null = null;

const RELEASE_TIMEOUT_MS = 3000;

export async function registerPushToken(userId: string, token: string): Promise<boolean> {
  try {
    // claim_push_token also removes this device from any account that was
    // signed in on it before, so that account's notifications stop arriving.
    const { error } = await supabase.rpc('claim_push_token', { push_token: token, push_platform: 'android' });
    if (!error) return true;
    // Server without push_dispatch.sql yet: keep registering the old way.
    if (error.code !== 'PGRST202') return false;
    const { error: upsertError } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );
    return !upsertError;
  } catch (err) {
    console.warn('Could not register push token with backend:', err);
    return false;
  }
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  try {
    await supabase.from('user_push_tokens').delete().match({ user_id: userId, token });
  } catch {
    /* ignore */
  }
}

/**
 * Detach this device from the account before it signs out. Bounded so an
 * offline sign-out is never held up; the next sign-in claims the token anyway.
 */
export async function releasePushToken(userId: string | null | undefined): Promise<void> {
  if (!userId || !deviceToken) return;
  const token = deviceToken;
  await Promise.race([
    unregisterPushToken(userId, token),
    new Promise<void>((resolve) => setTimeout(resolve, RELEASE_TIMEOUT_MS)),
  ]);
}

/** Test hook: the token registration would have provided. */
export function setDeviceTokenForTests(token: string | null): void {
  deviceToken = token;
}

export function initPushNotifications(
  userId?: string,
  callbacks?: {
    onNavigate?: (route: 'today' | 'board' | 'social' | 'private' | 'admin') => void;
  }
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  if (isInitialized) return () => {};
  isInitialized = true;

  const registrationSub = PushNotifications.addListener('registration', async (token: Token) => {
    deviceToken = token.value;
    if (userId) {
      await registerPushToken(userId, token.value);
    }
  });

  const registrationErrorSub = PushNotifications.addListener('registrationError', (err) => {
    console.warn('FCM registration error:', err);
  });

  const notificationReceivedSub = PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: PushNotificationSchema) => {
      console.log('FCM push notification received in foreground:', notification.title);
    }
  );

  const actionSub = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const data = action.notification.data as Record<string, unknown> | undefined;
      const type = data?.type as string | undefined;

      if (type === 'morning_briefing') {
        callbacks?.onNavigate?.('today');
      } else if (type === 'admin_request' || type === 'admin_reply' || type === 'admin_report' || type === 'admin_backer' || type === 'admin_hub') {
        callbacks?.onNavigate?.('admin');
      } else if (type === 'community') {
        // A chat push opens the community chat at its room ('' is General).
        requestOpenCommunity(typeof data?.room === 'string' ? data.room : '');
        callbacks?.onNavigate?.('social');
      } else if (type === 'hashtag_reply' || type === 'board_update') {
        callbacks?.onNavigate?.('social');
      } else if (type === 'dm' || type === 'friend_request' || type === 'room_invite' || type === 'room_request' || type === 'room') {
        callbacks?.onNavigate?.('private');
        // A message opens its chat once the Private Hub is on screen.
        // "sender" (pushes before v8.0.0 used "from", which FCM rejects).
        const sender = data?.sender ?? data?.from;
        if (type === 'dm' && typeof sender === 'string') requestOpenDm(sender);
      }
    }
  );

  void (async () => {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      let granted = permStatus.receive === 'granted';
      if (!granted) {
        const reqStatus = await PushNotifications.requestPermissions();
        granted = reqStatus.receive === 'granted';
      }
      if (granted) {
        await PushNotifications.register();
      }
    } catch (err) {
      console.warn('Push notification initialization error:', err);
    }
  })();

  return () => {
    void registrationSub.then((h) => h.remove());
    void registrationErrorSub.then((h) => h.remove());
    void notificationReceivedSub.then((h) => h.remove());
    void actionSub.then((h) => h.remove());
    isInitialized = false;
  };
}
