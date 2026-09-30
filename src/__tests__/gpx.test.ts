import { WorkoutSession } from '../types';
import { buildGpx } from '../utils/gpx';

const T0 = Date.UTC(2026, 8, 30, 8, 0, 0);

function session(mode: WorkoutSession['mode']): WorkoutSession {
  return {
    id: 'x',
    mode,
    startedAt: T0,
    endedAt: T0 + 60_000,
    durationSec: 60,
    avgHr: 140,
    maxHr: 150,
    minHr: 130,
    hrSamples: [],
    route: [
      { lat: 55.1234567, lng: 37.7654321, t: T0 },
      { lat: 55.2, lng: 37.8, t: T0 + 1000 },
    ],
  };
}

describe('buildGpx', () => {
  it('writes every route point with its time', () => {
    const gpx = buildGpx(session('outdoor'));
    expect(gpx).toContain('<trkpt lat="55.123457" lon="37.765432"><time>2026-09-30T08:00:00.000Z</time></trkpt>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
  });

  it('marks a ride as cycling and a run as running', () => {
    expect(buildGpx(session('cycling'))).toContain('<type>cycling</type>');
    expect(buildGpx(session('outdoor'))).toContain('<type>running</type>');
  });
});
