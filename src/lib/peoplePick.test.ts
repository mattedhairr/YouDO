import { describe, expect, it } from 'vitest';
import { chosenLine, matchParts } from './peoplePick';

describe('choosing people for an email', () => {
  it('says who of those chosen can get it', () => {
    expect(chosenLine(1, 1)).toBe('can get email');
    expect(chosenLine(2, 2)).toBe('both can get email');
    expect(chosenLine(5, 5)).toBe('all can get email');
    expect(chosenLine(3, 2)).toBe('2 of 3 can get email');
    expect(chosenLine(1, 0)).toBe('0 of 1 can get email');
  });

  it('finds the first match of the search, ignoring case and a leading @', () => {
    expect(matchParts('Kabir Singh', 'ka')).toEqual(['', 'Ka', 'bir Singh']);
    expect(matchParts('Akash Gupta', 'KA')).toEqual(['A', 'ka', 'sh Gupta']);
    expect(matchParts('kabir.neet', '@kab')).toEqual(['', 'kab', 'ir.neet']);
    expect(matchParts('Meera Iyer', 'zz')).toEqual(['Meera Iyer', '', '']);
    expect(matchParts('Meera Iyer', '  ')).toEqual(['Meera Iyer', '', '']);
  });
});
