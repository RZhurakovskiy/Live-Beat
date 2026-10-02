import { MAX_VERSION_CODE, resolveVersionCode } from '../../plugins/buildNumber';

const appJson = require('../../app.json');
const buildConfig = require('../../app.config.js');

describe('resolveVersionCode', () => {
  test('номер сборки от CI проходит как есть', () => {
    expect(resolveVersionCode('391246')).toBe(391246);
  });

  test('пробелы и перевод строки по краям не мешают', () => {
    expect(resolveVersionCode(' 42\n')).toBe(42);
  });

  test('переменной нет или она пустая: 1, как при запуске без CI', () => {
    expect(resolveVersionCode(undefined)).toBe(1);
    expect(resolveVersionCode('')).toBe(1);
    expect(resolveVersionCode('   ')).toBe(1);
  });

  test('всё, что не целое положительное число, даёт 1', () => {
    for (const raw of ['abc', '12abc', '1.5', '-5', '0', '1e6', '0x10', '+7']) {
      expect(resolveVersionCode(raw)).toBe(1);
    }
  });

  test('граница int: максимум проходит, на единицу больше нет', () => {
    expect(resolveVersionCode(String(MAX_VERSION_CODE))).toBe(MAX_VERSION_CODE);
    expect(resolveVersionCode(String(MAX_VERSION_CODE + 1))).toBe(1);
  });
});

describe('app.config.js', () => {
  const saved = process.env.LIVEBEAT_VERSION_CODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.LIVEBEAT_VERSION_CODE;
    else process.env.LIVEBEAT_VERSION_CODE = saved;
  });

  test('versionCode берётся из окружения', () => {
    process.env.LIVEBEAT_VERSION_CODE = '391246';
    expect(buildConfig({ config: appJson.expo }).android.versionCode).toBe(391246);
  });

  test('без переменной versionCode равен 1', () => {
    delete process.env.LIVEBEAT_VERSION_CODE;
    expect(buildConfig({ config: appJson.expo }).android.versionCode).toBe(1);
  });

  test('package id и разрешения из app.json не теряются', () => {
    process.env.LIVEBEAT_VERSION_CODE = '5';
    const android = buildConfig({ config: appJson.expo }).android;
    expect(android.package).toBe('com.pulsetracker.app');
    expect(android.permissions).toEqual(appJson.expo.android.permissions);
  });

  test('остальные поля конфига переносятся как есть', () => {
    const result = buildConfig({ config: appJson.expo });
    expect(result.name).toBe('LiveBeat');
    expect(result.version).toBe(appJson.expo.version);
    expect(result.plugins).toEqual(appJson.expo.plugins);
  });
});
