import { supabase } from './supabase';
import { SUPPORT_UPI_ID } from './backers';

/**
 * What Settings → Support YouDO shows, set by the admin in Admin Hub → Controls
 * (supabase/support_settings.sql). Older app versions keep their built-in UPI ID
 * and QR; paused claims are refused by the server for every version.
 */
export interface SupportSettings {
  supportEnabled: boolean;
  upiId: string;
  qrEnabled: boolean;
  claimsEnabled: boolean;
}

/** Until the server has answered, or on a server without support_settings.sql. */
export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  supportEnabled: true,
  upiId: SUPPORT_UPI_ID,
  qrEnabled: true,
  claimsEnabled: true,
};

export const SUPPORT_SETTINGS_EVENT = 'youdo-support-settings-updated';
const CACHE_KEY = 'youdo-support-settings-v1';
// The same rule as the server's check.
const UPI_ID = /^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9]{2,64}$/;

export const isValidUpiId = (value: string) => UPI_ID.test(value.trim());

/** The scan-to-pay link a UPI QR code holds; UPI apps open it as "Pay to <ID>". */
export const upiPayUri = (upiId: string) => `upi://pay?pa=${upiId}&pn=YouDO&cu=INR`;

export function parseSupportSettings(value: unknown): SupportSettings | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const upiId = typeof row.upiId === 'string' ? row.upiId.trim() : '';
  if (!isValidUpiId(upiId)) return null;
  const flag = (key: string) => (typeof row[key] === 'boolean' ? (row[key] as boolean) : true);
  return { supportEnabled: flag('supportEnabled'), upiId, qrEnabled: flag('qrEnabled'), claimsEnabled: flag('claimsEnabled') };
}

/** The last settings this device saw, so Support looks right offline. */
export function cachedSupportSettings(): SupportSettings {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return (raw && parseSupportSettings(JSON.parse(raw))) || DEFAULT_SUPPORT_SETTINGS;
  } catch {
    return DEFAULT_SUPPORT_SETTINGS;
  }
}

function remember(settings: SupportSettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch { /* still shown this session */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUPPORT_SETTINGS_EVENT, { detail: settings }));
}

/** The admin's settings, or null when the server can't be reached or lacks them. */
export async function fetchSupportSettings(): Promise<SupportSettings | null> {
  try {
    const { data, error } = await supabase.rpc('support_settings');
    const settings = error ? null : parseSupportSettings(data);
    if (settings) remember(settings);
    return settings;
  } catch {
    return null;
  }
}

/** Admin only (the server checks). Throws the server's message on failure. */
export async function saveSupportSettings(next: SupportSettings): Promise<SupportSettings> {
  const { data, error } = await supabase.rpc('save_support_settings', {
    support_enabled: next.supportEnabled,
    upi_id: next.upiId.trim(),
    qr_enabled: next.qrEnabled,
    claims_enabled: next.claimsEnabled,
  });
  if (error) throw new Error(error.message);
  const saved = parseSupportSettings(data);
  if (!saved) throw new Error('The server did not return the saved settings.');
  remember(saved);
  return saved;
}
