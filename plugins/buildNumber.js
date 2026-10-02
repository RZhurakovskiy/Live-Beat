/**
 * Наибольший versionCode, который принимает Android: это знаковое 32-битное целое,
 * берём с запасом.
 */
const MAX_VERSION_CODE = 2100000000;

/**
 * Разбирает номер сборки, который CI кладёт в окружение (`LIVEBEAT_VERSION_CODE`).
 *
 * Android и магазин считают обновлением только сборку с большим versionCode, поэтому
 * номер обязан быть целым положительным и не выходить за int. Всё остальное (переменной
 * нет, пусто, текст, дробь, ноль, минус, слишком большое) даёт 1: так запуск без CI
 * работает как раньше, а мусор в окружении не превращается в NaN внутри Gradle.
 *
 * @param {string | undefined} raw значение переменной окружения
 * @returns {number} versionCode для `android.versionCode`
 */
function resolveVersionCode(raw) {
  if (typeof raw !== 'string') return 1;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return 1;
  const value = Number(text);
  return value >= 1 && value <= MAX_VERSION_CODE ? value : 1;
}

module.exports = { MAX_VERSION_CODE, resolveVersionCode };
