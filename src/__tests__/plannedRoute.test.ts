import { WorkoutSession } from '../types';
import { buildGpx } from '../utils/gpx';
import {
  decodePlannedRoute,
  MAX_PLANNED_POINTS,
  parseGpx,
  plannedDistanceMeters,
  thinPoints,
} from '../utils/plannedRoute';

const STRAVA_LIKE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><time>2026-09-30T06:00:00Z</time></metadata>
 <trk>
  <name>Утро &amp; парк</name>
  <type>running</type>
  <trkseg>
   <trkpt lat="56.3269" lon="44.0059"><ele>150</ele><time>2026-09-30T06:00:00Z</time></trkpt>
   <trkpt lon="44.0070" lat="56.3275"><ele>151</ele></trkpt>
   <trkpt lat='56.3280' lon='44.0081'/>
  </trkseg>
 </trk>
</gpx>`;

describe('parseGpx', () => {
  it('reads track points in any attribute order and quotes', () => {
    const route = parseGpx(STRAVA_LIKE, 'файл')!;
    expect(route.points).toEqual([
      { lat: 56.3269, lng: 44.0059 },
      { lat: 56.3275, lng: 44.007 },
      { lat: 56.328, lng: 44.0081 },
    ]);
  });

  it('takes the name from the file and decodes entities', () => {
    expect(parseGpx(STRAVA_LIKE, 'файл')!.name).toBe('Утро & парк');
  });

  it('falls back to route points when there is no track', () => {
    const xml = '<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2.1"/></rte></gpx>';
    expect(parseGpx(xml, 'маршрут')).toEqual({
      name: 'маршрут',
      points: [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
    });
  });

  it('refuses a file without a route', () => {
    expect(parseGpx('{"format":"livebeat-history"}', 'x')).toBeNull();
    expect(parseGpx('<gpx><trkpt lat="1" lon="2"/></gpx>', 'x')).toBeNull();
    expect(parseGpx('<gpx><trkpt lat="999" lon="2"/><trkpt lat="1" lon="2"/></gpx>', 'x')).toBeNull();
  });

  it('reads the GPX that LiveBeat itself exports', () => {
    const session: WorkoutSession = {
      id: 'x',
      mode: 'outdoor',
      startedAt: 0,
      endedAt: 1,
      durationSec: 1,
      avgHr: 0,
      maxHr: 0,
      minHr: 0,
      hrSamples: [],
      route: [
        { lat: 55.1, lng: 37.1, t: 0 },
        { lat: 55.2, lng: 37.2, t: 1000 },
      ],
    };
    expect(parseGpx(buildGpx(session), 'x')!.points).toHaveLength(2);
  });

  it('thins a huge track down to the limit', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => `<trkpt lat="${55 + i / 1e5}" lon="37"/>`).join('');
    const route = parseGpx(`<gpx>${many}</gpx>`, 'x')!;
    expect(route.points).toHaveLength(MAX_PLANNED_POINTS);
  });
});

describe('thinPoints', () => {
  it('keeps the first and the last point', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ lat: i, lng: 0 }));
    const thin = thinPoints(points, 10);
    expect(thin).toHaveLength(10);
    expect(thin[0]).toEqual(points[0]);
    expect(thin[9]).toEqual(points[99]);
  });
});

describe('plannedDistanceMeters', () => {
  it('measures the route', () => {
    const route = { name: 'x', points: [{ lat: 55, lng: 37 }, { lat: 55.01, lng: 37 }] };
    expect(plannedDistanceMeters(route)).toBeGreaterThan(1100);
    expect(plannedDistanceMeters(route)).toBeLessThan(1120);
  });
});

describe('decodePlannedRoute', () => {
  it('round-trips and rejects garbage', () => {
    const route = { name: 'Парк', points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] };
    expect(decodePlannedRoute(JSON.stringify(route))).toEqual(route);
    expect(decodePlannedRoute('{oops')).toBeNull();
    expect(decodePlannedRoute(JSON.stringify({ name: 'x', points: [{ lat: 1, lng: 2 }] }))).toBeNull();
    expect(decodePlannedRoute(null)).toBeNull();
  });
});
