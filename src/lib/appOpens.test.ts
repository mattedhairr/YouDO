import { describe, expect, it } from 'vitest';
import { deviceNumber, localDay, openDue, setUsageCountOn, usageCountOn } from './appOpens';
import { STORAGE_KEYS } from './storageKeys';

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
};

describe('the daily open note', () => {
  it('is on until turned off', () => {
    const storage = memory();
    expect(usageCountOn(storage)).toBe(true);
    setUsageCountOn(false, storage);
    expect(usageCountOn(storage)).toBe(false);
    expect(openDue(storage, '2026-11-24', true)).toBe(false);
  });

  it('stays on when there is no storage at all', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new ReferenceError('localStorage is not defined'); } });
    try {
      expect(usageCountOn()).toBe(true);
      expect(() => setUsageCountOn(false)).not.toThrow();
    } finally {
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('goes once a day, and only online', () => {
    const storage = memory();
    expect(openDue(storage, '2026-11-24', false)).toBe(false);
    expect(openDue(storage, '2026-11-24', true)).toBe(true);
    storage.setItem(STORAGE_KEYS.lastOpenNote, '2026-11-24');
    expect(openDue(storage, '2026-11-24', true)).toBe(false);
    expect(openDue(storage, '2026-11-25', true)).toBe(true);
  });

  it('makes the phone number once and keeps it', () => {
    const storage = memory();
    const first = deviceNumber(storage, () => '11111111-2222-3333-4444-555555555555');
    expect(deviceNumber(storage, () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(first);
    storage.setItem(STORAGE_KEYS.deviceNumber, 'broken');
    expect(deviceNumber(storage, () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('uses the phone\'s own date', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
