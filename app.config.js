const { resolveVersionCode } = require('./plugins/buildNumber');

/**
 * Динамическая часть конфига Expo. Всё постоянное лежит в `app.json`, сюда попадает только
 * то, что приходит из окружения сборки: `android.versionCode`. Его считает CI по времени
 * (шаг «Номер сборки» в `.github/workflows/build-android.yml`), без CI остаётся 1.
 *
 * Номер нужен магазину: RuStore и сам Android принимают обновлением только сборку с
 * большим versionCode, а у Expo по умолчанию он всегда 1. Остальные поля `android`
 * (package, разрешения, иконка) переносятся как есть: package id менять нельзя.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: resolveVersionCode(process.env.LIVEBEAT_VERSION_CODE),
  },
});
