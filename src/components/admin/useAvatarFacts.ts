import { useEffect, useState } from 'react';
import { fetchAvatarFacts, type AvatarFact } from '../../lib/avatarFacts';

/** Pictures for the people on screen, asked for once per person (v9.1). */
export function useAvatarFacts(ids: string[]): Map<string, AvatarFact> {
  const [facts, setFacts] = useState<Map<string, AvatarFact>>(() => new Map());
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    fetchAvatarFacts(key.split(',')).then((next) => { if (live) setFacts(next); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  return facts;
}
