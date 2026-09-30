import { bytesToText, deviceDisplayName, pickAdvertisedName } from '../ble/deviceInfo';

const utf8 = (text: string) => Uint8Array.from(Buffer.from(text, 'utf8'));

describe('bytesToText', () => {
  it('decodes ASCII', () => {
    expect(bytesToText(utf8('Magene'))).toBe('Magene');
  });

  it('decodes multi-byte UTF-8', () => {
    expect(bytesToText(utf8('Пульс ♥ 😀'))).toBe('Пульс ♥ 😀');
  });

  it('drops NUL padding and trims', () => {
    expect(bytesToText(Uint8Array.from([0x48, 0x36, 0x34, 0x00, 0x00, 0x00]))).toBe('H64');
    expect(bytesToText(utf8('  H64 \r\n'))).toBe('H64');
  });

  it('replaces broken sequences instead of throwing', () => {
    // 0xD0 ждёт продолжения, а приходит ASCII; 0xFF вообще не бывает в UTF-8.
    expect(bytesToText(Uint8Array.from([0xd0, 0x41, 0xff, 0x42]))).toBe('�A�B');
    // Обрезанная в конце последовательность.
    expect(bytesToText(Uint8Array.from([0x41, 0xe2, 0x99]))).toBe('A��');
  });

  it('returns an empty string for an empty value', () => {
    expect(bytesToText(new Uint8Array(0))).toBe('');
  });
});

describe('deviceDisplayName', () => {
  it('joins manufacturer and model', () => {
    expect(deviceDisplayName('Magene', 'H64')).toBe('Magene H64');
  });

  it('does not repeat the manufacturer already in the model', () => {
    expect(deviceDisplayName('Magene', 'Magene H64')).toBe('Magene H64');
    expect(deviceDisplayName('MAGENE', 'magene h64')).toBe('magene h64');
  });

  it('uses the model alone when there is no manufacturer', () => {
    expect(deviceDisplayName(null, 'H64')).toBe('H64');
    expect(deviceDisplayName('  ', 'H64')).toBe('H64');
  });

  it('gives up without a model', () => {
    expect(deviceDisplayName('Magene', null)).toBeNull();
    expect(deviceDisplayName('Magene', ' \u0000 ')).toBeNull();
    expect(deviceDisplayName(null, null)).toBeNull();
  });

  it('cleans stray whitespace and control characters', () => {
    expect(deviceDisplayName(' Magene\u0000', ' H64\n')).toBe('Magene H64');
  });
});

describe('pickAdvertisedName', () => {
  it('prefers the name with letters over a bare serial', () => {
    expect(pickAdvertisedName('25643-209', 'H64 25643')).toBe('H64 25643');
    expect(pickAdvertisedName('Magene H64', '25643-209')).toBe('Magene H64');
  });

  it('falls back to whatever is there', () => {
    expect(pickAdvertisedName('25643-209', null)).toBe('25643-209');
    expect(pickAdvertisedName(null, '25643-209')).toBe('25643-209');
    expect(pickAdvertisedName('25643-209', '11111')).toBe('25643-209');
  });

  it('returns null when the strap sends no name', () => {
    expect(pickAdvertisedName(null, null)).toBeNull();
    expect(pickAdvertisedName('  ', '')).toBeNull();
  });
});
