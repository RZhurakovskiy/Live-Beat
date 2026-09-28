import { createRrDeduper } from '../ble/rrStream';

describe('createRrDeduper', () => {
  it('passes a compliant stream through untouched', () => {
    const deduper = createRrDeduper();
    expect(deduper.push([800])).toEqual([800]);
    expect(deduper.push([820])).toEqual([820]);
    expect(deduper.push([790, 810])).toEqual([790, 810]);
    expect(deduper.stats()).toEqual({ accepted: 4, dropped: 0 });
  });

  it('drops a packet the strap re-sent in full', () => {
    const deduper = createRrDeduper();
    deduper.push([800]);
    expect(deduper.push([800])).toEqual([]);
    expect(deduper.push([800])).toEqual([]);
    expect(deduper.stats()).toEqual({ accepted: 1, dropped: 2 });
  });

  it('keeps only the new tail of a rolling window', () => {
    const deduper = createRrDeduper();
    expect(deduper.push([800, 820])).toEqual([800, 820]);
    expect(deduper.push([820, 790])).toEqual([790]);
    expect(deduper.push([790, 805])).toEqual([805]);
    expect(deduper.stats()).toEqual({ accepted: 4, dropped: 2 });
  });

  it('ignores packets without RR data', () => {
    const deduper = createRrDeduper();
    deduper.push([800]);
    expect(deduper.push([])).toEqual([]);
    // The empty packet must not be treated as the previous one.
    expect(deduper.push([800])).toEqual([]);
  });

  it('starts a fresh stream after reset', () => {
    const deduper = createRrDeduper();
    deduper.push([800]);
    deduper.reset();
    expect(deduper.push([800])).toEqual([800]);
  });

  it('resets counters without losing the stream position', () => {
    const deduper = createRrDeduper();
    deduper.push([800]);
    deduper.resetStats();
    expect(deduper.push([800])).toEqual([]);
    expect(deduper.stats()).toEqual({ accepted: 0, dropped: 1 });
  });
});
