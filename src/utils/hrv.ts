const MIN_RR_MS = 300;
const MAX_RR_MS = 2000;

// A beat that differs from the last good beat by more than this share is
// almost always a missed/extra beat or a contact artifact rather than real
// variability (Malik's 20% rule). Every pair touching such a beat is skipped,
// so one bad beat can't blow a whole minute's RMSSD up into a fake spike.
const MAX_RELATIVE_CHANGE = 0.2;

// After this many rejected beats in a row the rhythm has really moved on (or
// the anchor itself was the bad beat): take the current beat as the new
// reference instead of rejecting the rest of the run.
const REANCHOR_AFTER = 3;

// RMSSD is defined over successive beats. If the intervals we received add up
// to much less than the time that passed, beats are missing from the stream and
// neighbouring values are not neighbouring beats — the result would not be
// RMSSD at all, so it is not reported.
export const MIN_RR_COVERAGE = 0.8;

// Share of the elapsed time that the received RR-intervals account for.
// ~1 for a strap that reports every beat.
export function rrCoverage(segments: number[][], elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  let total = 0;
  for (const segment of segments) for (const rr of segment) total += rr;
  return total / elapsedMs;
}

export interface MinuteHrv {
  hrvMs: number | null;
  coverage: number;
}

export function minuteHrv(segments: number[][], elapsedMs: number): MinuteHrv {
  const coverage = rrCoverage(segments, elapsedMs);
  return { hrvMs: coverage >= MIN_RR_COVERAGE ? rmssdSegments(segments) : null, coverage };
}

// RMSSD — root mean square of successive RR-interval differences, in ms.
// Standard short-term HRV metric. Needs at least one usable pair of intervals.
export function rmssd(rrIntervals: number[]): number | null {
  return rmssdSegments([rrIntervals]);
}

// Same metric over a beat stream broken into segments. Every gap in the stream
// (contact lost, link down, reconnect) starts a new segment: the first beat
// after a gap is not the successor of the last one before it, so diffing across
// the boundary would invent variability that never happened.
//
// A pair is counted only when both beats are good and directly follow each
// other. An interval outside 300–2000 ms is a sensor glitch that also breaks
// the run: the beats around it are not neighbours.
export function rmssdSegments(segments: number[][]): number | null {
  let sumSq = 0;
  let pairs = 0;

  for (const segment of segments) {
    let lastGood: number | null = null;
    let previousWasGood = false;
    let rejectedInRow = 0;

    for (const rr of segment) {
      if (rr < MIN_RR_MS || rr > MAX_RR_MS) {
        lastGood = null;
        previousWasGood = false;
        rejectedInRow = 0;
        continue;
      }

      if (lastGood === null) {
        lastGood = rr;
        previousWasGood = true;
        continue;
      }

      const diff = rr - lastGood;
      if (Math.abs(diff) > lastGood * MAX_RELATIVE_CHANGE) {
        previousWasGood = false;
        rejectedInRow += 1;
        if (rejectedInRow >= REANCHOR_AFTER) {
          lastGood = rr;
          previousWasGood = true;
          rejectedInRow = 0;
        }
        continue;
      }

      if (previousWasGood) {
        sumSq += diff * diff;
        pairs += 1;
      }
      lastGood = rr;
      previousWasGood = true;
      rejectedInRow = 0;
    }
  }

  if (pairs === 0) return null;
  return Math.round(Math.sqrt(sumSq / pairs));
}
