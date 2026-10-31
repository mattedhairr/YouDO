import { supabase } from './supabase';

/**
 * The developer's personal UPI ID that supporters pay to, until the admin's
 * Support settings (lib/supportSettings) have loaded.
 */
export const SUPPORT_UPI_ID = 'mattedhairr@axl';

export interface SubmitBackerParams {
  amount: number;
  utr: string;
  note?: string;
  username?: string;
}

export interface SubmitBackerResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function submitHubBacker({
  amount,
  utr,
  note,
  username,
}: SubmitBackerParams): Promise<SubmitBackerResult> {
  try {
    const { data, error } = await supabase.rpc('submit_hub_backer', {
      p_amount: amount,
      p_utr: utr.trim(),
      p_note: note?.trim() || null,
      p_username: username?.trim() || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; id?: string; error?: string } | null;
    if (res?.success) {
      return { success: true, id: res.id };
    }
    return { success: false, error: res?.error || 'Submission failed' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: message };
  }
}

export interface PendingBackerItem {
  id: string;
  user_id?: string | null;
  username: string;
  amount: number;
  currency: string;
  utr: string;
  note?: string | null;
  status: string;
  created_at: string;
}

export async function fetchPendingHubBackers(): Promise<PendingBackerItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_pending_hub_backers');
    if (error || !Array.isArray(data)) {
      return [];
    }
    return data as PendingBackerItem[];
  } catch {
    return [];
  }
}

export async function reviewHubBacker(
  backerId: string,
  status: 'verified' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('review_hub_backer', {
      p_backer_id: backerId,
      p_status: status,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    const res = data as { success?: boolean; error?: string } | null;
    return { success: Boolean(res?.success), error: res?.error };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: message };
  }
}
