import { supabase } from './supabase';

/** What a chat needs to draw someone: their picture or emoji, and the backer ring. */
export interface AvatarFact {
  avatarUrl?: string;
  backer: boolean;
}

export function parseAvatarFacts(rows: unknown): Map<string, AvatarFact> {
  const facts = new Map<string, AvatarFact>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) continue;
    const avatar = typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : undefined;
    facts.set(row.id, { avatarUrl: avatar, backer: row.is_backer === true });
  }
  return facts;
}

/** Ids not asked for yet; each id is asked for once per app run. */
export function missingIds(ids: Iterable<string>, known: ReadonlySet<string>): string[] {
  return [...new Set(ids)].filter((id) => id && !known.has(id));
}

const cache = new Map<string, AvatarFact>();
const asked = new Set<string>();

/**
 * Pictures and backer flags for these people, from their profiles (readable by
 * anyone signed in). People without a profile keep their initial.
 */
export async function fetchAvatarFacts(ids: Iterable<string>): Promise<Map<string, AvatarFact>> {
  const wanted = missingIds(ids, asked);
  for (let start = 0; start < wanted.length; start += 100) {
    const chunk = wanted.slice(start, start + 100);
    const { data, error } = await supabase.from('profiles').select('id, avatar_url, is_backer').in('id', chunk);
    if (error) continue;
    chunk.forEach((id) => asked.add(id));
    parseAvatarFacts(data).forEach((fact, id) => cache.set(id, fact));
  }
  return new Map(cache);
}
