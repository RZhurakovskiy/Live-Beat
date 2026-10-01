import { downsample, projectRoute, sparkline, toPath } from '../utils/routeShape';

describe('downsample', () => {
  it('keeps short lists as they are', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('thins a long list evenly and keeps both ends', () => {
    const list = Array.from({ length: 1000 }, (_, i) => i);
    const thin = downsample(list, 50);
    expect(thin).toHaveLength(50);
    expect(thin[0]).toBe(0);
    expect(thin[49]).toBe(999);
  });
});

describe('projectRoute', () => {
  const box = { w: 300, h: 200, pad: 10 };

  it('fits every point inside the box with the padding', () => {
    const route = [
      { lat: 55.0, lng: 37.0 },
      { lat: 55.01, lng: 37.02 },
      { lat: 55.005, lng: 37.01 },
    ];
    for (const p of projectRoute(route, box.w, box.h, box.pad)) {
      expect(p.x).toBeGreaterThanOrEqual(box.pad - 1e-6);
      expect(p.x).toBeLessThanOrEqual(box.w - box.pad + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(box.pad - 1e-6);
      expect(p.y).toBeLessThanOrEqual(box.h - box.pad + 1e-6);
    }
  });

  it('puts north at the top', () => {
    const [south, north] = projectRoute([{ lat: 55.0, lng: 37.0 }, { lat: 55.01, lng: 37.0 }], box.w, box.h, box.pad);
    expect(north.y).toBeLessThan(south.y);
  });

  it('keeps proportions: a square on the ground does not look stretched', () => {
    // На широте 60 градус долготы вдвое короче градуса широты.
    const route = [
      { lat: 60.0, lng: 30.0 },
      { lat: 60.0, lng: 30.02 },
      { lat: 60.01, lng: 30.02 },
      { lat: 60.01, lng: 30.0 },
    ];
    const pts = projectRoute(route, 300, 300, 0);
    const width = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const height = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    // 0.02 градуса долготы на широте 60 равны 0.01 градуса широты, значит ширина и высота равны.
    expect(width / height).toBeCloseTo(1, 1);
  });

  it('centres the route in the box', () => {
    const pts = projectRoute([{ lat: 55, lng: 37 }, { lat: 55.001, lng: 37.05 }], 300, 300, 10);
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
    const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
    expect(cx).toBeCloseTo(150, 5);
    expect(cy).toBeCloseTo(150, 5);
  });

  it('puts a route that never moved in the centre instead of dividing by zero', () => {
    const pts = projectRoute([{ lat: 55, lng: 37 }, { lat: 55, lng: 37 }], 300, 200, 10);
    expect(pts).toEqual([{ x: 150, y: 100 }, { x: 150, y: 100 }]);
  });

  it('handles a perfectly straight east-west line', () => {
    const pts = projectRoute([{ lat: 55, lng: 37 }, { lat: 55, lng: 37.1 }], 300, 200, 10);
    expect(pts[0].y).toBeCloseTo(100, 5);
    expect(pts[1].y).toBeCloseTo(100, 5);
    expect(pts[1].x - pts[0].x).toBeCloseTo(280, 5);
  });

  it('returns nothing for no points', () => {
    expect(projectRoute([], 300, 200, 10)).toEqual([]);
  });
});

describe('sparkline', () => {
  it('draws a higher value higher on the picture', () => {
    const [low, high] = sparkline([100, 160], 300, 100, 10);
    expect(high.y).toBeLessThan(low.y);
  });

  it('spans the width from edge to edge of the padded box', () => {
    const pts = sparkline([1, 2, 3], 300, 100, 10);
    expect(pts[0].x).toBe(10);
    expect(pts[2].x).toBe(290);
  });

  it('puts a constant series in the middle', () => {
    for (const p of sparkline([120, 120, 120], 300, 100, 10)) expect(p.y).toBe(50);
  });

  it('copes with a single value', () => {
    expect(sparkline([120], 300, 100, 10)).toEqual([{ x: 150, y: 50 }]);
  });
});

describe('toPath', () => {
  it('builds an SVG path', () => {
    expect(toPath([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe('M 1.0 2.0 L 3.5 4.0');
    expect(toPath([])).toBe('');
  });
});
