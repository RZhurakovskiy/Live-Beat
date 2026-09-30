import { WorkoutSession } from '../types';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildGpx(session: WorkoutSession): string {
  const name = `LiveBeat - ${new Date(session.startedAt).toISOString()}`;
  const points = (session.route ?? [])
    .map(
      (point) =>
        `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lng.toFixed(6)}"><time>${new Date(
          point.t,
        ).toISOString()}</time></trkpt>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LiveBeat" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

export function gpxFileName(session: WorkoutSession): string {
  const date = new Date(session.startedAt).toISOString().replace(/[:.]/g, '-');
  return `livebeat-${date}.gpx`;
}
