#!/usr/bin/env bash
# Подписывает standalone APK релизным ключом из секретов GitHub вместо debug-ключа.
#
# Зачем: после prebuild Gradle подписывает release-сборку публичным debug-ключом из
# репозитория (пароль «android»). Магазин такую подпись принимать не должен, а запомнив
# подпись первой загрузки, требует её же для всех обновлений. Поэтому в магазин уходит только
# сборка, подписанная настоящим ключом, который лежит вне репозитория (plans/rustore.md).
#
# Использование: bash scripts/sign-release-apk.sh <путь к APK>
# Ключ приходит переменными окружения (в CI это секреты репозитория):
#   RELEASE_KEYSTORE_BASE64    файл ключа (.p12) в base64
#   RELEASE_KEYSTORE_PASSWORD  пароль файла ключа
#   RELEASE_KEY_ALIAS          имя ключа внутри файла
#   RELEASE_KEY_PASSWORD       пароль самого ключа; необязателен, по умолчанию как у файла
#
# Секретов нет: ничего не меняет и завершается успешно, APK остаётся с debug-подписью.
# Ключ есть, а чего-то не хватает, подпись не вышла или осталась прежней: завершается
# ошибкой, чтобы сборка не ушла в магазин с чужой подписью.
#
# Для проверки на своей машине можно задать APKSIGNER (путь к apksigner) и ANDROID_HOME.
set -euo pipefail

apk="${1:?Первым аргументом нужен путь к APK}"

if [ -z "${RELEASE_KEYSTORE_BASE64:-}" ]; then
  echo "Релизный ключ не задан: APK остаётся с debug-подписью (для магазина не годится)."
  exit 0
fi

# Ключ есть, значит человек хочет релизную подпись. Без остального молча выпустить
# сборку с debug-подписью нельзя.
: "${RELEASE_KEYSTORE_PASSWORD:?Не задан секрет RELEASE_KEYSTORE_PASSWORD}"
: "${RELEASE_KEY_ALIAS:?Не задан секрет RELEASE_KEY_ALIAS}"
export KEY_PASSWORD="${RELEASE_KEY_PASSWORD:-$RELEASE_KEYSTORE_PASSWORD}"

if [ ! -f "$apk" ]; then
  echo "::error::Нет файла $apk"
  exit 1
fi

# Самый новый apksigner из установленных build-tools: те же, что только что собрали APK.
apksigner="${APKSIGNER:-}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$apksigner" ] && [ -n "$sdk" ]; then
  apksigner="$(ls -d "$sdk"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
fi
if [ -z "$apksigner" ]; then
  echo "::error::apksigner не найден, проверьте ANDROID_HOME"
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Пробелы и переводы строк (в том числе \r из Windows) в секрете вычищаем: при вставке
# в форму GitHub они легко добавляются.
if ! printf '%s' "$RELEASE_KEYSTORE_BASE64" | tr -d '[:space:]' | base64 -d > "$work/release.keystore" \
  || [ ! -s "$work/release.keystore" ]; then
  echo "::error::RELEASE_KEYSTORE_BASE64 не похож на файл ключа в base64"
  exit 1
fi

# Отпечаток сертификата, которым APK подписан сейчас и которым будет подписан.
cert_digest() {
  "$apksigner" verify --print-certs "$1" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -n 1
}

before="$(cert_digest "$apk" || true)"

"$apksigner" sign \
  --ks "$work/release.keystore" \
  --ks-key-alias "$RELEASE_KEY_ALIAS" \
  --ks-pass env:RELEASE_KEYSTORE_PASSWORD \
  --key-pass env:KEY_PASSWORD \
  --out "$work/signed.apk" \
  "$apk"

after="$(cert_digest "$work/signed.apk" || true)"
if [ -z "$after" ]; then
  echo "::error::Подписанный APK не прошёл проверку apksigner"
  exit 1
fi

# Секрет с тем же ключом, что уже стоял (по ошибке положили debug-keystore): отпечаток
# не изменится. Этот ключ публичный, для магазина он не годится.
if [ "$after" = "$before" ]; then
  echo "::error::Подпись не изменилась: в секрете лежит тот же ключ, что и в сборке (скорее всего публичный debug). Нужен свой релизный ключ."
  exit 1
fi

# Заменяем исходный файл только после того, как всё прошло: при любой ошибке выше он
# остаётся нетронутым, шаг падает, и до загрузки артефактов сборка не доходит.
mv "$work/signed.apk" "$apk"
echo "APK подписан релизным ключом."
echo "Отпечаток сертификата (SHA-256): $after"
