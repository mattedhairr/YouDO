import { describe, expect, it } from 'vitest';
import { compareAppVersions, releaseHighlights } from './appUpdate';

describe('app updates', () => {
  it('compares semantic release versions without treating v prefixes differently', () => {
    expect(compareAppVersions('v6.0.0', '5.0.0')).toBe(1);
    expect(compareAppVersions('6.0', '6.0.0')).toBe(0);
    expect(compareAppVersions('6.0.0', '6.1.0')).toBe(-1);
    expect(compareAppVersions('10.0.0', '9.9.9')).toBe(1);
  });

  it('extracts a short plain-language changelog from release bullets', () => {
    const body = [
      '## v7',
      '- **Safer sync** — Your device plan stays isolated.',
      '- [Clear history](https://example.com) with restore points.',
      '- `Update notice` opens the official release.',
      '- Fourth item is intentionally omitted.',
    ].join('\n');
    expect(releaseHighlights(body)).toEqual([
      'Safer sync — Your device plan stays isolated.',
      'Clear history with restore points.',
      'Update notice opens the official release.',
    ]);
  });
});
