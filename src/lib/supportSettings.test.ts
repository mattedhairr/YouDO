import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPPORT_SETTINGS, cachedSupportSettings, isValidUpiId, parseSupportSettings, upiPayUri } from './supportSettings';

describe('isValidUpiId', () => {
  it('accepts name@bank IDs and rejects anything else', () => {
    expect(isValidUpiId('mattedhairr@axl')).toBe(true);
    expect(isValidUpiId(' study.fund-22@okicici ')).toBe(true);
    expect(isValidUpiId('no-handle')).toBe(false);
    expect(isValidUpiId('a@b')).toBe(false);
    expect(isValidUpiId('name@bank&pa=other@x')).toBe(false);
    expect(isValidUpiId('two@at@bank')).toBe(false);
  });
});

describe('upiPayUri', () => {
  it('builds the scan-to-pay link a UPI QR holds', () => {
    expect(upiPayUri('study.fund@okaxis')).toBe('upi://pay?pa=study.fund@okaxis&pn=YouDO&cu=INR');
  });
});

describe('parseSupportSettings', () => {
  it('reads the server row and trims the UPI ID', () => {
    expect(parseSupportSettings({ supportEnabled: false, upiId: ' study.fund@okaxis ', qrEnabled: false, claimsEnabled: true }))
      .toEqual({ supportEnabled: false, upiId: 'study.fund@okaxis', qrEnabled: false, claimsEnabled: true });
  });

  it('keeps a switch on when the server leaves it out', () => {
    expect(parseSupportSettings({ upiId: 'study.fund@okaxis' })).toEqual({ ...DEFAULT_SUPPORT_SETTINGS, upiId: 'study.fund@okaxis' });
  });

  it('rejects rows without a valid UPI ID', () => {
    expect(parseSupportSettings(null)).toBeNull();
    expect(parseSupportSettings({ upiId: 'not an id' })).toBeNull();
    expect(parseSupportSettings('mattedhairr@axl')).toBeNull();
  });
});

describe('cachedSupportSettings', () => {
  it('falls back to the built-in settings without storage', () => {
    expect(cachedSupportSettings()).toEqual(DEFAULT_SUPPORT_SETTINGS);
  });
});
