// Heart Rate Measurement (0x2A37) is supposed to carry only the RR-intervals
// measured since the previous notification, and to omit the field entirely when
// no beat happened in between. Plenty of straps ignore that: they re-send the
// last interval, or a rolling window that overlaps the previous packet.
//
// Those repeats are poison for RMSSD — every re-sent interval adds a successive
// difference of exactly 0 and drags the whole minute down towards zero. This
// module removes them before the intervals reach any consumer.

export interface RrStats {
  /** RR-intervals accepted as new beats. */
  accepted: number;
  /** RR-intervals discarded as repeats of the previous packet. */
  dropped: number;
}

export interface RrDeduper {
  /** Returns the intervals of this packet that are genuinely new. */
  push(rr: number[]): number[];
  /** Forget the previous packet (link went down: the next one starts a new stream). */
  reset(): void;
  stats(): RrStats;
  resetStats(): void;
}

// Longest suffix of `prev` that is also a prefix of `next`, i.e. the part the
// sensor re-sent. Equal packets give an overlap of the whole packet.
function overlapLength(prev: number[], next: number[]): number {
  const max = Math.min(prev.length, next.length);
  for (let k = max; k > 0; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      if (prev[prev.length - k + i] !== next[i]) {
        same = false;
        break;
      }
    }
    if (same) return k;
  }
  return 0;
}

export function createRrDeduper(): RrDeduper {
  let previous: number[] = [];
  let accepted = 0;
  let dropped = 0;

  return {
    push(rr) {
      if (rr.length === 0) return [];

      const overlap = overlapLength(previous, rr);
      previous = rr;

      const fresh = overlap > 0 ? rr.slice(overlap) : rr;
      dropped += overlap;
      accepted += fresh.length;
      return fresh;
    },

    reset() {
      previous = [];
    },

    stats() {
      return { accepted, dropped };
    },

    resetStats() {
      accepted = 0;
      dropped = 0;
    },
  };
}
