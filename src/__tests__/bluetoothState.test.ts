import { BLUETOOTH_OFF_FOOTER, readinessFromBleState } from '../ble/bluetoothState';

describe('readinessFromBleState', () => {
  it('maps the adapter states the library reports', () => {
    expect(readinessFromBleState('PoweredOn')).toBe('ready');
    expect(readinessFromBleState('PoweredOff')).toBe('off');
    expect(readinessFromBleState('Unauthorized')).toBe('unauthorized');
    expect(readinessFromBleState('Unsupported')).toBe('unsupported');
  });

  it('does not call a restarting adapter switched off', () => {
    expect(readinessFromBleState('Resetting')).toBe('unknown');
    expect(readinessFromBleState('Unknown')).toBe('unknown');
  });

  it('survives a state it has never seen', () => {
    expect(readinessFromBleState('SomethingNew')).toBe('unknown');
  });

  it('keeps the home screen wording without a long dash', () => {
    expect(BLUETOOTH_OFF_FOOTER).not.toContain('—');
  });
});
