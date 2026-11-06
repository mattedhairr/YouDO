import { describe, expect, it } from 'vitest';
import type { Task, TaskSession } from '../types';
import { advanceDeletionLedger } from './deletionLedger';
import { defaultStreakMeta } from './focusTrends';
import { decideSyncAction, isWorkspaceEffectivelyEmpty } from './syncDecision';
import { workspaceFingerprint, workspaceSignature, type TrashRecord, type WorkspaceSlice } from './syncMerge';
import { mergeSettingsInto, mergeWorkspaceThreeWay } from './syncMerge3';
import { canonicalWorkspaceFingerprint, differOnlyInSettings } from './syncPayload';

/**
 * Two devices and a cloud that follow the same rules as the store's sync: read
 * the cloud, decide, then write only if the revision has not moved. Edits are
 * random and made up; each round checks what must hold however they interleave.
 */
const DAY = '2026-11-04';
const fp = (slice: WorkspaceSlice) => canonicalWorkspaceFingerprint(slice, DAY);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const emptySlice = (): WorkspaceSlice => ({
  tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [], deletionLedger: [],
  streakMeta: { ...defaultStreakMeta(DAY), barHours: 1, updatedAt: 1000 }, updatedAt: 1,
});

type Cloud = { revision: number; slice: WorkspaceSlice | null; writes: number };
type Device = { name: string; clockOffset: number; now: number; slice: WorkspaceSlice; base: WorkspaceSlice | null; baseFp: string | null; paused: boolean };

const device = (name: string, clockOffset: number): Device => ({ name, clockOffset, now: 10_000, slice: emptySlice(), base: null, baseFp: null, paused: false });
const agree = (d: Device, slice: WorkspaceSlice) => { d.base = copy(slice); d.baseFp = fp(slice); d.paused = false; };
const push = (d: Device, cloud: Cloud, seenRevision: number, raceFirst = false) => {
  if (raceFirst || cloud.revision !== seenRevision) return false; // compare-and-set refused
  cloud.slice = copy(d.slice);
  cloud.revision += 1;
  cloud.writes += 1;
  agree(d, d.slice);
  return true;
};

function sync(d: Device, cloud: Cloud, conflictStrategy?: 'merge') {
  const seen = cloud.revision;
  const remote = cloud.slice ? copy(cloud.slice) : null;
  const localFp = fp(d.slice);
  const remoteFp = remote ? fp(remote) : null;
  const decision = decideSyncAction({
    localFingerprint: localFp, remoteFingerprint: remoteFp, baseFingerprint: d.baseFp,
    localEmpty: isWorkspaceEffectivelyEmpty(d.slice), conflictStrategy,
    baseWasEmpty: Boolean(d.base && isWorkspaceEffectivelyEmpty(d.base)),
    onlySettingsDiffer: Boolean(remote && localFp !== remoteFp && differOnlyInSettings(d.slice, remote, DAY)),
  });
  if (decision === 'noop') agree(d, d.slice);
  else if (decision === 'pull') { d.slice = remote!; agree(d, remote!); }
  else if (decision === 'push') push(d, cloud, seen);
  else if (decision === 'settings') {
    d.slice = mergeSettingsInto(d.slice, remote!, d.base);
    if (fp(d.slice) === remoteFp) agree(d, d.slice); else push(d, cloud, seen);
  } else if ((decision === 'conflict' && d.base && remote) || decision === 'merge') {
    d.slice = mergeWorkspaceThreeWay(isWorkspaceEffectivelyEmpty(d.slice) ? null : d.base, d.slice, remote!, d.now + d.clockOffset).slice;
    if (fp(d.slice) === remoteFp) agree(d, d.slice); else push(d, cloud, seen);
  } else d.paused = true;
  return decision;
}

const settle = (devices: Device[], cloud: Cloud) => {
  for (let round = 0; round < 8; round++) for (const d of devices) sync(d, cloud);
};

function random(seed: number) {
  let s = seed;
  return (n: number) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
}
const card = (id: string): Task => ({ id, title: `Card ${id}`, description: '', priority: 'medium', targetDate: DAY, deadline: null, steps: [], progress: 0, createdAt: 1, order: 0 });
const sitting = (id: string, taskId: string, at: number): TaskSession => ({ id, taskId, startTime: at, endTime: at + 60_000, netFocusMs: 60_000 } as TaskSession);

type Tracker = { added: Set<string>; deleted: Set<string>; edited: Set<string>; sittings: Set<string>; serial: number };

function edit(d: Device, roll: (n: number) => number, t: Tracker) {
  d.now += 1000;
  const before = d.slice;
  const stamp = d.now + d.clockOffset;
  const next: WorkspaceSlice = { ...before, updatedAt: stamp };
  const pick = () => before.tasks[roll(before.tasks.length)];
  switch (roll(5)) {
    case 0: {
      const id = `${d.name}-${t.serial++}`;
      t.added.add(id);
      next.tasks = [...before.tasks, card(id)];
      break;
    }
    case 1: {
      if (!before.tasks.length) return;
      const target = pick();
      t.edited.add(target.id);
      next.tasks = before.tasks.map((x) => (x.id === target.id ? { ...x, description: `${x.description}+${d.name}` } : x));
      break;
    }
    case 2: {
      if (!before.tasks.length) return;
      const target = pick();
      t.deleted.add(target.id);
      next.tasks = before.tasks.filter((x) => x.id !== target.id);
      next.deletionLedger = advanceDeletionLedger(before.deletionLedger ?? [], before, next, stamp);
      break;
    }
    case 3: {
      if (!before.tasks.length) return;
      const target = pick();
      const id = `s-${t.serial++}`;
      t.sittings.add(id);
      next.sessionHistory = { ...before.sessionHistory, [target.id]: [...(before.sessionHistory[target.id] ?? []), sitting(id, target.id, stamp)] };
      break;
    }
    default:
      next.streakMeta = { ...before.streakMeta!, barHours: 1 + roll(8), updatedAt: stamp };
  }
  d.slice = next;
}

describe('two devices over many random sessions', () => {
  it('always ends on one identical copy, keeps all work and stops writing', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const roll = random(seed);
      const a = device('a', 0);
      const b = device('b', -3_600_000 * (seed % 3)); // Some runs have a clock hours behind.
      const cloud: Cloud = { revision: 0, slice: null, writes: 0 };
      const t: Tracker = { added: new Set(), deleted: new Set(), edited: new Set(), sittings: new Set(), serial: 0 };
      settle([a, b], cloud); // Both have signed in once; a first sign-in with different work is the gate's choice.
      for (let step = 0; step < 30; step++) {
        edit(roll(2) ? a : b, roll, t);
        if (roll(3) === 0) sync(roll(2) ? a : b, cloud); // The other device is offline or asleep.
      }
      settle([a, b], cloud);

      const label = `seed ${seed}`;
      expect(fp(a.slice), label).toBe(fp(cloud.slice!));
      expect(fp(b.slice), label).toBe(fp(cloud.slice!));
      expect(a.paused || b.paused, label).toBe(false);

      const writes = cloud.writes;
      settle([a, b], cloud);
      expect(cloud.writes, `${label}: settled copies must not keep writing`).toBe(writes);

      const live = new Set(cloud.slice!.tasks.map((x) => x.id));
      for (const id of t.added) if (!t.deleted.has(id)) expect(live.has(id), `${label}: lost card ${id}`).toBe(true);
      for (const id of t.deleted) if (!t.edited.has(id)) expect(live.has(id), `${label}: deleted card ${id} came back`).toBe(false);
      const sittings = new Set(Object.values(cloud.slice!.sessionHistory).flat().map((x) => x.id));
      for (const id of t.sittings) expect(sittings.has(id), `${label}: lost sitting ${id}`).toBe(true);
    }
  }, 30_000); // 400 full simulations: far under a second each, but a busy or throttled machine needs room.

  it('survives both devices saving at the same moment', () => {
    const a = device('a', 0);
    const b = device('b', 0);
    const cloud: Cloud = { revision: 0, slice: null, writes: 0 };
    a.slice = { ...a.slice, tasks: [card('from-a')] };
    b.slice = { ...b.slice, tasks: [card('from-b')] };
    sync(a, cloud);
    expect(push(b, cloud, 0)).toBe(false); // Saved on an old revision: refused, nothing overwritten.
    expect(cloud.slice!.tasks.map((x) => x.id)).toEqual(['from-a']);
    sync(b, cloud, 'merge'); // First contact has no agreed copy, so this one needs the tap.
    settle([a, b], cloud);
    expect(cloud.slice!.tasks.map((x) => x.id).sort()).toEqual(['from-a', 'from-b']);
    expect(fp(a.slice)).toBe(fp(b.slice));
  });
});

describe('settings between devices', () => {
  const start = () => {
    const a = device('a', 0);
    const b = device('b', -3_600_000);
    const cloud: Cloud = { revision: 0, slice: null, writes: 0 };
    a.slice = { ...a.slice, tasks: [card('shared')] };
    settle([a, b], cloud);
    return { a, b, cloud };
  };
  const bar = (d: Device, barHours: number, updatedAt: number) => {
    d.slice = { ...d.slice, streakMeta: { ...d.slice.streakMeta!, barHours, updatedAt } };
  };

  it('takes a change from a device whose clock is behind', () => {
    const { a, b, cloud } = start();
    bar(b, 3, 500); // Older stamp than the 1000 already saved.
    settle([a, b], cloud);
    expect(a.slice.streakMeta?.barHours).toBe(3);
    expect(cloud.slice!.streakMeta?.barHours).toBe(3);
  });

  it('lets the later change win when both devices changed', () => {
    const { a, b, cloud } = start();
    bar(a, 4, 2000);
    bar(b, 6, 3000);
    settle([a, b], cloud);
    expect(a.slice.streakMeta?.barHours).toBe(6);
    expect(b.slice.streakMeta?.barHours).toBe(6);
  });

  it('settles on one value when the stamps are exactly equal', () => {
    const { a, b, cloud } = start();
    bar(a, 4, 2000);
    bar(b, 6, 2000);
    settle([a, b], cloud);
    const writes = cloud.writes;
    settle([a, b], cloud);
    expect(a.slice.streakMeta?.barHours).toBe(b.slice.streakMeta?.barHours);
    expect(cloud.writes).toBe(writes);
  });

  it('keeps a setting changed here and another changed there', () => {
    const { a, b, cloud } = start();
    bar(b, 5, 900); // The later clock on device a must not undo this.
    a.slice = { ...a.slice, pacePrefs: { optedIn: true, displayName: 'Asha', examLabel: 'GATE', updatedAt: 800 } };
    settle([a, b], cloud);
    expect(a.slice.streakMeta?.barHours).toBe(5);
    expect(b.slice.pacePrefs?.displayName).toBe('Asha');
  });
});

describe('dead ends', () => {
  it('combines by itself when a device that never had work changed a setting', () => {
    const pc = device('pc', 0);
    const phone = device('phone', 0);
    const cloud: Cloud = { revision: 0, slice: null, writes: 0 };
    settle([pc, phone], cloud);
    pc.slice = { ...pc.slice, streakMeta: { ...pc.slice.streakMeta!, barHours: 2, updatedAt: 5000 } };
    phone.slice = { ...phone.slice, tasks: [card('phone-work')] };
    sync(phone, cloud);
    sync(pc, cloud);
    expect(pc.paused).toBe(false);
    settle([pc, phone], cloud);
    expect(pc.slice.tasks.map((x) => x.id)).toEqual(['phone-work']);
    expect(phone.slice.streakMeta?.barHours).toBe(2);
  });

  it('never restores work by itself on a device whose work really was there', () => {
    const d = device('a', 0);
    d.base = { ...emptySlice(), tasks: [card('old')] };
    d.baseFp = fp(d.base);
    d.slice = { ...emptySlice(), streakMeta: { ...emptySlice().streakMeta!, barHours: 2 } };
    const cloud: Cloud = { revision: 3, slice: { ...emptySlice(), tasks: [card('old'), card('more')] }, writes: 0 };
    expect(sync(d, cloud)).toBe('empty-error');
    expect(d.slice.tasks).toEqual([]);
    expect(sync(d, cloud, 'merge')).toBe('merge');
    expect(d.slice.tasks.map((x) => x.id)).toEqual(['old', 'more']);
  });

  it('lets a device with work recreate a cloud copy that was cleared, but only on a tap', () => {
    const d = device('a', 0);
    const cloud: Cloud = { revision: 0, slice: null, writes: 0 };
    d.slice = { ...d.slice, tasks: [card('mine')] };
    sync(d, cloud);
    cloud.slice = null;
    expect(sync(d, cloud)).toBe('conflict');
    expect(d.paused).toBe(true);
    expect(sync(d, cloud, 'merge')).toBe('push');
    expect(cloud.slice).not.toBeNull();
  });
});

describe('a combine respects what was removed on purpose', () => {
  const record = { id: 'r1', deletedAt: 5, node: { id: 'gone', title: 'Gone', type: 'node', completed: false, children: [] }, tasks: [] } as unknown as TrashRecord;
  const base: WorkspaceSlice = { ...emptySlice(), recentlyDeletedGoals: [record], sessionHistory: { x: [sitting('old', 'x', 1000)] } };

  it('keeps emptied trash and trimmed sittings gone', () => {
    const here = { ...base, recentlyDeletedGoals: [], sessionHistory: {}, updatedAt: 9 };
    const there = { ...base, tasks: [card('new')], updatedAt: 8 };
    const merged = mergeWorkspaceThreeWay(base, here, there).slice;
    expect(merged.recentlyDeletedGoals).toEqual([]);
    expect(merged.sessionHistory).toEqual({});
    expect(merged.tasks.map((x) => x.id)).toEqual(['new']);
  });

  it('keeps everything when there is no agreed copy to judge by', () => {
    const here = { ...base, recentlyDeletedGoals: [], sessionHistory: {} };
    const merged = mergeWorkspaceThreeWay(null, here, base).slice;
    expect(merged.recentlyDeletedGoals).toHaveLength(1);
    expect(Object.values(merged.sessionHistory).flat()).toHaveLength(1);
  });

  it('keeps a sitting the other device changed, and new trash from either side', () => {
    const longer = { ...sitting('old', 'x', 1000), endTime: 91_000, netFocusMs: 90_000 };
    const newRecord = { ...record, id: 'r2', node: { ...record.node, id: 'gone2' } };
    const here = { ...base, sessionHistory: {} };
    const there = { ...base, sessionHistory: { x: [longer] }, recentlyDeletedGoals: [record, newRecord] };
    const merged = mergeWorkspaceThreeWay(base, here, there).slice;
    expect(merged.sessionHistory.x?.[0].netFocusMs).toBe(90_000);
    expect(merged.recentlyDeletedGoals.map((x) => x.id)).toEqual(['r1', 'r2']);
  });
});

describe('fingerprints', () => {
  const referenceFnv = (slice: WorkspaceSlice) => {
    const value = workspaceSignature(slice);
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= BigInt(value.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `${value.length}:${hash.toString(16).padStart(16, '0')}`;
  };

  it('match the ones already saved on devices, including non-English text', () => {
    const samples: WorkspaceSlice[] = [
      emptySlice(),
      { ...emptySlice(), tasks: [card('हिंदी कार्ड ✓')] },
      { ...emptySlice(), tasks: Array.from({ length: 300 }, (_, i) => card(`t${i}`)) },
    ];
    for (const sample of samples) expect(workspaceFingerprint(sample)).toBe(referenceFnv(sample));
  });
});
