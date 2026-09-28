import { ContactVerdict, createContactDetector } from '../ble/contactDetector';
import type { SensorContact } from '../ble/hrParser';

function reading(bpm: number, rr: number[] = [], contact: SensorContact = 'unsupported') {
  return { bpm, rr, contact };
}

describe('contact detector', () => {
  it('accepts normal readings from a strap that sends RR-intervals', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let i = 1; i <= 20; i++) {
      expect(detector.push(reading(70, [850 + (i % 3)]), i * 1000).hasContact).toBe(true);
    }
  });

  it('flags a frozen BPM once new RR-intervals stop arriving', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(96, [620 + t / 1000]), t);

    // Lifted off the skin: the strap keeps repeating 96 but reports no new beats.
    const verdicts: ContactVerdict[] = [];
    for (let t = 6000; t <= 23000; t += 1000) verdicts.push(detector.push(reading(96), t));

    expect(verdicts[14].hasContact).toBe(true); // t = 20 s, still inside the 15 s window
    expect(verdicts[15].hasContact).toBe(false); // t = 21 s
    expect(verdicts[15].reason).toBe('no-rr');
    expect(verdicts[17].hasContact).toBe(false);
  });

  it('keeps contact through the short RR pauses of a steady pulse', () => {
    // Field log, Magene H64: ~1 new interval per 1.7 s, BPM steady for 5+ s.
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(90, [665 + t / 1000]), t);
    for (let t = 5500; t <= 13000; t += 500) {
      expect(detector.push(reading(90, [670]), t).hasContact).toBe(true);
    }
  });

  it('keeps contact when RR-intervals pause but the pulse keeps changing', () => {
    // Field log, Magene H64 at rest: RR missing for 5-7 s while the BPM moved.
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(88, [680 + t / 1000]), t);
    const bpms = [88, 89, 89, 90, 89, 88, 88, 87];
    for (let i = 0; i < bpms.length; i++) {
      expect(detector.push(reading(bpms[i]), 6000 + i * 1000).hasContact).toBe(true);
    }
  });

  it('treats a repeated RR list as no new beat', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(96, [600 + t / 1000]), t);
    let last: ContactVerdict = { hasContact: true, reason: null };
    for (let t = 6000; t <= 22000; t += 1000) last = detector.push(reading(96, [605]), t);
    expect(last.hasContact).toBe(false);
    expect(last.reason).toBe('no-rr');
  });

  it('recovers as soon as real beats come back', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(80, [750 + t / 1000]), t);
    expect(detector.push(reading(80), 30000).hasContact).toBe(false);
    expect(detector.push(reading(78, [770]), 31000).hasContact).toBe(true);
  });

  it('trusts the contact flag of a strap that has reported contact before', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    expect(detector.push(reading(70, [850], 'detected'), 1000).hasContact).toBe(true);
    const verdict = detector.push(reading(70, [], 'lost'), 2000);
    expect(verdict.hasContact).toBe(false);
    expect(verdict.reason).toBe('sensor-flag');
    expect(detector.push(reading(71, [845], 'detected'), 3000).hasContact).toBe(true);
  });

  it('ignores a "lost" flag from a strap that never reported contact', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    expect(detector.push(reading(70, [850], 'lost'), 1000).hasContact).toBe(true);
    expect(detector.push(reading(71, [860], 'lost'), 2000).hasContact).toBe(true);
  });

  it('treats readings below the valid range as no signal', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    const verdict = detector.push(reading(0), 1000);
    expect(verdict.hasContact).toBe(false);
    expect(verdict.reason).toBe('no-signal');
  });

  it('flags a flatline from a strap without RR-intervals or contact reporting', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    detector.push(reading(80), 1000);
    expect(detector.push(reading(80), 31000).hasContact).toBe(true);
    const verdict = detector.push(reading(80), 31001);
    expect(verdict.hasContact).toBe(false);
    expect(verdict.reason).toBe('flatline');
    expect(detector.push(reading(81), 32000).hasContact).toBe(true);
  });

  it('does not flag a steady BPM while RR-intervals keep coming', () => {
    // Low-HRV hearts can hold the same integer BPM for a long time.
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 120000; t += 1000) {
      expect(detector.push(reading(75, [800 + ((t / 1000) % 2)]), t).hasContact).toBe(true);
    }
  });

  it('gives a new connection a grace period but remembers the strap sends RR', () => {
    const detector = createContactDetector();
    detector.onConnected(0);
    for (let t = 1000; t <= 5000; t += 1000) detector.push(reading(70, [850 + t / 1000]), t);

    detector.onConnected(100000);
    expect(detector.push(reading(70), 101000).hasContact).toBe(true);
    expect(detector.push(reading(70), 116000).hasContact).toBe(true);
    expect(detector.push(reading(70), 116001).hasContact).toBe(false);
  });
});
