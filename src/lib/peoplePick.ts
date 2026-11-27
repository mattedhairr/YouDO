/** The most people one email can be sent to by name (the server refuses more: admin_email.sql). */
export const PICK_LIMIT = 50;

/** Who of those chosen can get the email: "both can get email", "2 of 3 can get email". */
export function chosenLine(chosen: number, reach: number): string {
  if (reach >= chosen) return chosen === 1 ? 'can get email' : chosen === 2 ? 'both can get email' : 'all can get email';
  return `${reach} of ${chosen} can get email`;
}

/** The text split around the first match of the search, ignoring case: [before, match, after]. */
export function matchParts(text: string, search: string): [string, string, string] {
  const needle = search.trim().replace(/^@/, '').toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return [text, '', ''];
  return [text.slice(0, at), text.slice(at, at + needle.length), text.slice(at + needle.length)];
}
