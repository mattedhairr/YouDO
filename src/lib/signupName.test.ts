import { describe, expect, it } from 'vitest';
import { signupName } from './signupName';

describe('the name at Create account', () => {
  it('keeps a real name, tidied', () => {
    expect(signupName('Meera Shah')).toBe('Meera Shah');
    expect(signupName('  Meera   Shah ')).toBe('Meera Shah');
  });

  it('refuses a name made only of spaces', () => {
    expect(signupName('')).toBeNull();
    expect(signupName('    ')).toBeNull();
    expect(signupName('\t \n')).toBeNull();
  });
});
