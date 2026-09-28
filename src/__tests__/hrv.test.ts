import { minuteHrv, rmssd, rmssdSegments, rrCoverage } from '../utils/hrv';

describe('rrCoverage / minuteHrv', () => {
  // ~93 bpm resting-ish rhythm with some real variation
  const beats = Array.from({ length: 93 }, (_, i) => 645 + ((i * 7) % 5) * 4);
  const beatsMs = beats.reduce((a, b) => a + b, 0);

  it('is ~1 when every beat of the minute arrived', () => {
    expect(rrCoverage([beats], beatsMs)).toBeCloseTo(1, 5);
    expect(minuteHrv([beats], beatsMs).hrvMs).toBe(rmssd(beats));
  });

  it('refuses to report RMSSD when the strap skipped most beats', () => {
    // Field log, Magene H64: ~35 intervals a minute at ~93 bpm.
    const everyThird = beats.filter((_, i) => i % 3 === 0);
    const result = minuteHrv([everyThird], beatsMs);
    expect(result.coverage).toBeLessThan(0.4);
    expect(result.hrvMs).toBeNull();
  });

  it('sums every run of the minute', () => {
    expect(rrCoverage([[500, 500], [1000]], 2000)).toBe(1);
  });

  it('reports zero coverage for an empty or instant buffer', () => {
    expect(rrCoverage([[800]], 0)).toBe(0);
    expect(minuteHrv([[]], 60000)).toEqual({ hrvMs: null, coverage: 0 });
  });
});

describe('rmssd', () => {
  it('returns null with fewer than two usable intervals', () => {
    expect(rmssd([])).toBeNull();
    expect(rmssd([800])).toBeNull();
  });

  it('is zero for constant intervals', () => {
    expect(rmssd([800, 800, 800])).toBe(0);
  });

  it('computes RMSSD of successive differences', () => {
    // diff of 100 over one pair => sqrt(100^2 / 1) = 100
    expect(rmssd([800, 900])).toBe(100);
    // diffs 50 and -50 => sqrt((2500+2500)/2) = 50
    expect(rmssd([800, 850, 800])).toBe(50);
  });

  it('treats an impossible interval as a break, not as a missing value', () => {
    // 800 and 810 are not neighbours: something happened between them.
    expect(rmssd([800, 5000, 810])).toBeNull();
    // pairs 800->810 and 820->830 survive on both sides of the glitch => 10
    expect(rmssd([800, 810, 5000, 820, 830])).toBe(10);
    expect(rmssd([800, 810, 100, 820, 830])).toBe(10);
  });

  it('drops every pair touching an ectopic beat and its compensatory pause', () => {
    // 600 is premature, 1000 the pause after it. Compared with the beat right
    // before it, 1000 -> 800 sits exactly on the 20% line and used to leak in
    // as a 200 ms spike; compared with the last good beat (800) it is rejected.
    expect(rmssd([800, 600, 1000, 800])).toBeNull();
    // around it the real pairs still count: 810-800 and 790-800 => 10
    expect(rmssd([800, 810, 600, 1000, 800, 790])).toBe(10);
  });

  it('keeps every pair of a healthy rhythm with strong breathing variation', () => {
    // A resting minute: ~67 bpm swinging ±60 ms with each breath (RSA).
    const rr = Array.from({ length: 70 }, (_, i) => Math.round(900 + 60 * Math.sin((i * 2 * Math.PI) / 4.5)));
    let sumSq = 0;
    for (let i = 1; i < rr.length; i++) sumSq += (rr[i] - rr[i - 1]) ** 2;
    const unfiltered = Math.round(Math.sqrt(sumSq / (rr.length - 1)));
    expect(unfiltered).toBeGreaterThan(50);
    expect(rmssd(rr)).toBe(unfiltered);
  });

  it('re-anchors when the rhythm really moved on', () => {
    // three beats in a row far from 800: 600 becomes the new reference,
    // the following 610 and 600 pair up => diffs 10, -10 => 10
    expect(rmssd([800, 600, 600, 600, 610, 600])).toBe(10);
  });

  it('recovers when the first beat of a run is the bad one', () => {
    // 1600 anchors the run, the next three are rejected against it, then the
    // run re-anchors on 790 and 800, 790 pair up => 10
    expect(rmssd([1600, 800, 810, 790, 800, 790])).toBe(10);
  });

  it('skips beat pairs that jump more than 20% (missed or extra beats)', () => {
    // 1600 ms is a missed beat: both pairs touching it are left out,
    // leaving diffs 10 and -10 => 10 instead of a ~560 ms spike.
    expect(rmssd([800, 810, 1600, 800, 790])).toBe(10);
    expect(rmssd([800, 1600])).toBeNull();
  });
});

describe('rmssdSegments', () => {
  it('never pairs the last beat before a gap with the first one after it', () => {
    // As one run the 800 -> 900 step counts as a pair: diffs 0, 100, 0 over
    // three pairs => 58. Split by a gap that invented step disappears.
    expect(rmssdSegments([[800, 800, 900, 900]])).toBe(58);
    expect(rmssdSegments([[800, 800], [900, 900]])).toBe(0);
  });

  it('pools the pairs of every run into one value', () => {
    // diffs 40 and -40 across two runs => sqrt((1600+1600)/2) = 40
    expect(rmssdSegments([[800, 840], [840, 800]])).toBe(40);
  });

  it('returns null when no run holds a usable pair', () => {
    expect(rmssdSegments([])).toBeNull();
    expect(rmssdSegments([[800], [900], []])).toBeNull();
  });
});
