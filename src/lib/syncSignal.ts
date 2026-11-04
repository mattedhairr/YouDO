import { supabase } from './supabase';

export type SyncSignal = { send: () => void; close: () => void };

/**
 * A "this account's cloud copy changed" ping between its open devices, so they
 * look straight away instead of at the next 30-second check. It carries no data:
 * whoever receives it still reads the cloud through the account's own access.
 * If it never connects, the regular checks keep sync working.
 */
export function openSyncSignal(accountId: string, onChanged: () => void): SyncSignal {
  let joined = false;
  const channel = supabase.channel(`workspace-sync:${accountId}`, { config: { broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'changed' }, onChanged)
    .subscribe((status) => { joined = status === 'SUBSCRIBED'; });
  return {
    send: () => {
      if (!joined) return;
      void channel.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => undefined);
    },
    close: () => { void supabase.removeChannel(channel); },
  };
}
