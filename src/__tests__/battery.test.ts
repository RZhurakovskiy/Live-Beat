import { batteryInfo, CRITICAL_BATTERY_PERCENT, LOW_BATTERY_PERCENT } from '../ble/battery';

describe('batteryInfo', () => {
  it('shows a healthy charge quietly', () => {
    expect(batteryInfo(98)).toEqual({ percent: 98, tone: 'ok', hint: null });
    expect(batteryInfo(LOW_BATTERY_PERCENT + 1)?.tone).toBe('ok');
  });

  it('warns when the battery is getting low', () => {
    const info = batteryInfo(LOW_BATTERY_PERCENT)!;
    expect(info.tone).toBe('low');
    expect(info.hint).toContain('садится');
  });

  it('warns loudly when it is nearly dead', () => {
    const info = batteryInfo(CRITICAL_BATTERY_PERCENT)!;
    expect(info.tone).toBe('critical');
    expect(info.hint).toContain('почти села');
    expect(batteryInfo(0)?.tone).toBe('critical');
  });

  it('rounds a fractional value', () => {
    expect(batteryInfo(97.6)?.percent).toBe(98);
  });

  it('shows nothing when the strap did not report a charge', () => {
    expect(batteryInfo(null)).toBeNull();
  });

  it('refuses nonsense instead of inventing a percent', () => {
    expect(batteryInfo(-5)).toBeNull();
    expect(batteryInfo(130)).toBeNull();
    expect(batteryInfo(Number.NaN)).toBeNull();
  });

  it('uses no long dashes in hints', () => {
    for (const p of [5, 15]) expect(batteryInfo(p)?.hint).not.toContain('—');
  });
});
