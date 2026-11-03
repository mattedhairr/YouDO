import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPPORT_SETTINGS, cachedSupportSettings, isSupportPaused, isValidUpiId, parseSupportSettings, supportSettingsFor, upiPayUri } from './supportSettings';

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

describe('pausing support', () => {
  it('counts as paused when v8.3.2 left either switch off, whatever the QR switch says', () => {
    expect(isSupportPaused(DEFAULT_SUPPORT_SETTINGS)).toBe(false);
    expect(isSupportPaused({ ...DEFAULT_SUPPORT_SETTINGS, supportEnabled: false })).toBe(true);
    expect(isSupportPaused({ ...DEFAULT_SUPPORT_SETTINGS, claimsEnabled: false })).toBe(true);
    expect(isSupportPaused({ ...DEFAULT_SUPPORT_SETTINGS, qrEnabled: false })).toBe(false);
  });

  it('stores one choice as all three switches and trims the UPI ID', () => {
    expect(supportSettingsFor(' study.fund@okaxis ', true)).toEqual({ supportEnabled: false, upiId: 'study.fund@okaxis', qrEnabled: false, claimsEnabled: false });
    expect(supportSettingsFor('study.fund@okaxis', false)).toEqual({ supportEnabled: true, upiId: 'study.fund@okaxis', qrEnabled: true, claimsEnabled: true });
    expect(isSupportPaused(supportSettingsFor('study.fund@okaxis', true))).toBe(true);
    expect(isSupportPaused(supportSettingsFor('study.fund@okaxis', false))).toBe(false);
  });
});

describe('cachedSupportSettings', () => {
  it('falls back to the built-in settings without storage', () => {
    expect(cachedSupportSettings()).toEqual(DEFAULT_SUPPORT_SETTINGS);
  });
});
