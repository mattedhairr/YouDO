/**
 * The name typed at Create account, tidied (v9.1): spaces at the ends and
 * runs of spaces inside are dropped. Null when nothing is left, so a name made
 * only of spaces can't get past the required field.
 */
export function signupName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name || null;
}
