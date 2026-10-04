import { FOLLOW_ZOOM, MAX_ZOOM, MIN_ZOOM, routeBounds, stepZoom } from '../utils/mapView';

describe('routeBounds', () => {
  it('wraps a track in west, south, east, north order', () => {
    const b = routeBounds([
      { lat: 55.0, lng: 37.0 },
      { lat: 55.01, lng: 37.02 },
      { lat: 54.99, lng: 37.01 },
    ]);
    expect(b).toEqual([37.0, 54.99, 37.02, 55.01]);
  });

  it('returns null without points', () => {
    expect(routeBounds([])).toBeNull();
    expect(routeBounds(undefined, [])).toBeNull();
  });

  it('turns a single point into a box of minimum size, centred on it', () => {
    const b = routeBounds([{ lat: 55, lng: 37 }])!;
    expect(b[2] - b[0]).toBeGreaterThan(0.0017);
    expect(b[3] - b[1]).toBeGreaterThan(0.0017);
    expect((b[0] + b[2]) / 2).toBeCloseTo(37, 10);
    expect((b[1] + b[3]) / 2).toBeCloseTo(55, 10);
  });

  it('widens only the thin dimension of a straight track', () => {
    const b = routeBounds([
      { lat: 55, lng: 37 },
      { lat: 55, lng: 37.05 },
    ])!;
    expect(b[2] - b[0]).toBeCloseTo(0.05, 10);
    expect(b[3] - b[1]).toBeGreaterThan(0.0017);
  });

  it('includes the planned route as well as the recorded track', () => {
    const b = routeBounds([{ lat: 55, lng: 37 }], [{ lat: 55.1, lng: 37.1 }])!;
    expect(b[0]).toBeLessThanOrEqual(37);
    expect(b[2]).toBeGreaterThanOrEqual(37.1);
    expect(b[3]).toBeGreaterThanOrEqual(55.1);
  });

  it('ignores points with broken coordinates', () => {
    const b = routeBounds([
      { lat: 55, lng: 37 },
      { lat: NaN, lng: 38 },
      { lat: 55.01, lng: 37.01 },
    ])!;
    expect(b[2]).toBeCloseTo(37.01, 10);
  });
});

describe('stepZoom', () => {
  it('moves by the given step', () => {
    expect(stepZoom(15, 1)).toBe(16);
    expect(stepZoom(15, -1)).toBe(14);
  });

  it('never leaves the allowed range', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(MAX_ZOOM - 0.4, 1)).toBe(MAX_ZOOM);
  });

  it('starts from the follow zoom when the map has not reported one yet', () => {
    expect(stepZoom(null, 1)).toBe(FOLLOW_ZOOM + 1);
    expect(stepZoom(NaN, -1)).toBe(FOLLOW_ZOOM - 1);
  });
});
