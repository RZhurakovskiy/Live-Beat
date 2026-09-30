import { WorkoutSession } from '../types';

/** Экранирует спецсимволы XML в тексте. */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * GPX-трек уличной тренировки для обмена с другими приложениями: точки маршрута
 * со временем. Пульс в трек не пишется.
 */
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

/**
 * Имя GPX-файла по времени старта. Двоеточия и точки заменены дефисами, чтобы имя
 * годилось для любой файловой системы.
 */
export function gpxFileName(session: WorkoutSession): string {
  const date = new Date(session.startedAt).toISOString().replace(/[:.]/g, '-');
  return `livebeat-${date}.gpx`;
}
