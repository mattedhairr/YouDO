import { APP_VERSION } from './version';

const RELEASE_API = 'https://api.github.com/repos/mattedhairr/YouDO/releases/latest';
const CHECK_CACHE_KEY = 'youdo-update-check-v1';
const DISMISS_KEY = 'youdo-update-dismissed-v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface AppRelease {
  version: string;
  name: string;
  url: string;
  highlights: string[];
  publishedAt: string;
}

interface ReleaseResponse {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  body?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

interface UpdateCache {
  checkedAt: number;
  release: AppRelease | null;
}

function numericVersion(value: string): number[] {
  const match = value.trim().replace(/^v/i, '').match(/^\d+(?:\.\d+){0,2}/);
  if (!match) return [0, 0, 0];
  return match[0].split('.').map((part) => Number(part) || 0).concat([0, 0, 0]).slice(0, 3);
}

export function compareAppVersions(left: string, right: string): number {
  const a = numericVersion(left);
  const b = numericVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function plainText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/^[-–—\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function releaseHighlights(body: string, limit = 3): string[] {
  const bullets = body
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(plainText)
    .filter(Boolean);
  return [...new Set(bullets)].slice(0, limit);
}

function parseRelease(raw: ReleaseResponse): AppRelease | null {
  if (raw.draft || raw.prerelease) return null;
  if (typeof raw.tag_name !== 'string' || typeof raw.html_url !== 'string') return null;
  const version = raw.tag_name.replace(/^v/i, '');
  if (compareAppVersions(version, APP_VERSION) <= 0) return null;
  return {
    version,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `YouDO v${version}`,
    url: raw.html_url,
    highlights: releaseHighlights(typeof raw.body === 'string' ? raw.body : ''),
    publishedAt: typeof raw.published_at === 'string' ? raw.published_at : '',
  };
}

function readCache(): UpdateCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECK_CACHE_KEY) ?? 'null') as UpdateCache | null;
    return parsed && typeof parsed.checkedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    localStorage.setItem(CHECK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* update checks must never interrupt the workspace */
  }
}

export function dismissAppUpdate(version: string, now = Date.now()): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ version, until: now + CHECK_INTERVAL_MS }));
  } catch {
    /* ignore */
  }
}

function isDismissed(version: string, now: number): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null') as { version?: unknown; until?: unknown } | null;
    return parsed?.version === version && typeof parsed.until === 'number' && parsed.until > now;
  } catch {
    return false;
  }
}

export async function checkForAppUpdate(options?: { force?: boolean; signal?: AbortSignal }): Promise<AppRelease | null> {
  const now = Date.now();
  const cached = readCache();
  if (!options?.force && cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached.release && !isDismissed(cached.release.version, now) ? cached.release : null;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  try {
    const response = await fetch(RELEASE_API, {
      signal: options?.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const release = parseRelease(await response.json() as ReleaseResponse);
    writeCache({ checkedAt: now, release });
    return release && !isDismissed(release.version, now) ? release : null;
  } catch {
    return null;
  }
}
