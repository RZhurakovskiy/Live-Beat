import { parseHeartRateMeasurement } from '../ble/hrParser';

function b64(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

describe('parseHeartRateMeasurement', () => {
  it('reads a uint8 BPM with no RR', () => {
    const result = parseHeartRateMeasurement(b64([0x00, 70]));
    expect(result.bpm).toBe(70);
    expect(result.rr).toEqual([]);
  });

  it('reads a uint16 BPM (flag bit 0 set)', () => {
    // 300 уд/мин = 0x012C, младший байт первым: 0x2C, 0x01
    const result = parseHeartRateMeasurement(b64([0x01, 0x2c, 0x01]));
    expect(result.bpm).toBe(300);
    expect(result.rr).toEqual([]);
  });

  it('parses RR-intervals and converts 1/1024 s to ms', () => {
    // флаги 0x10 (есть RR), пульс 60, RR сырые 1024 (=1000 мс) и 512 (=500 мс)
    const result = parseHeartRateMeasurement(b64([0x10, 60, 0x00, 0x04, 0x00, 0x02]));
    expect(result.bpm).toBe(60);
    expect(result.rr).toEqual([1000, 500]);
  });

  it('skips the Energy Expended field before RR (flag bit 3)', () => {
    // флаги 0x18 (RR и энергия), пульс 60, энергия 2 байта, RR сырое 1024 = 1000 мс
    const result = parseHeartRateMeasurement(b64([0x18, 60, 0xff, 0x00, 0x00, 0x04]));
    expect(result.bpm).toBe(60);
    expect(result.rr).toEqual([1000]);
  });

  it('handles uint16 BPM together with RR', () => {
    // флаги 0x11, пульс 200 (0x00C8, то есть 0xC8, 0x00), RR сырое 1024 = 1000 мс
    const result = parseHeartRateMeasurement(b64([0x11, 0xc8, 0x00, 0x00, 0x04]));
    expect(result.bpm).toBe(200);
    expect(result.rr).toEqual([1000]);
  });

  it('reads the sensor contact bits (bit 2 = supported, bit 1 = detected)', () => {
    expect(parseHeartRateMeasurement(b64([0x06, 70])).contact).toBe('detected');
    expect(parseHeartRateMeasurement(b64([0x04, 70])).contact).toBe('lost');
    expect(parseHeartRateMeasurement(b64([0x00, 70])).contact).toBe('unsupported');
    expect(parseHeartRateMeasurement(b64([0x02, 70])).contact).toBe('unsupported');
    // биты контакта вместе с RR-интервалами
    const withRr = parseHeartRateMeasurement(b64([0x16, 60, 0x00, 0x04]));
    expect(withRr.contact).toBe('detected');
    expect(withRr.rr).toEqual([1000]);
  });

  it('reports no reading for a truncated packet instead of an undefined BPM', () => {
    expect(parseHeartRateMeasurement(b64([0x00])).bpm).toBe(0);
    expect(parseHeartRateMeasurement(b64([0x01, 0x2c])).bpm).toBe(0);
  });
});
