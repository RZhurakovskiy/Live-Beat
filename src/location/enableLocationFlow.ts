// Как включить геолокацию одним тапом и что делать, если так не получается. Чистый модуль без
// React Native, чтобы гонять в Jest; вызовы системы приходят снаружи (`backgroundLocation.ts`).
//
// Окно «Включить геолокацию?» показывают сервисы Google: сам по себе Android обычному приложению
// включать геолокацию не позволяет. Проект от сервисов Google сознательно не зависит
// (`plans/archive/field-fixes.md`, п. 9), поэтому окно здесь только попытка, а запасной путь,
// экран настроек геолокации, всегда остаётся.

/**
 * - `enabled`: геолокация включена, можно продолжать;
 * - `declined`: пользователь увидел окно и отказался, настройки не открываем;
 * - `settings`: окна не было или оно не помогло, открыт экран настроек геолокации.
 */
export type EnableOutcome = 'enabled' | 'declined' | 'settings';

/** Ошибка быстрее этого значит, что окна не было вовсе: человеку нужно время, чтобы его прочитать и нажать. */
export const QUICK_FAIL_MS = 1200;

/** Окно, которое не ответило за это время, считаем зависшим (сервисы Google сломаны или устарели). */
export const DIALOG_TIMEOUT_MS = 15000;

/** Что нужно потоку от системы. */
export interface EnableLocationDeps {
  /**
   * Показывает системное окно. Успех: пользователь включил геолокацию. Ошибка: отказался ИЛИ
   * окно показать нельзя (нет сервисов Google). Библиотека эти случаи не различает.
   */
  requestDialog: () => Promise<void>;
  /** Включена ли геолокация на телефоне прямо сейчас. */
  isEnabled: () => Promise<boolean>;
  /** Открывает экран настроек геолокации. */
  openSettings: () => Promise<void>;
  /** Текущее время в мс, подставляется в тестах. */
  now: () => number;
}

const TIMED_OUT = Symbol('timed-out');

/** Результат окна или `TIMED_OUT`, если оно не ответило вовремя. Ошибку окна пробрасывает как есть. */
function withTimeout(promise: Promise<void>, ms: number): Promise<void | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Открывает настройки и не падает, если и это не вышло: человек всё равно может включить в шторке. */
async function openSettingsSafely(deps: EnableLocationDeps): Promise<EnableOutcome> {
  try {
    await deps.openSettings();
  } catch {
    // нечего больше предложить, пользователь включит геолокацию сам
  }
  return 'settings';
}

/**
 * Пытается включить геолокацию окном в один тап, а если окна нет или оно не сработало,
 * открывает настройки. Различие между «отказался» и «окна нет» строится по времени: окно
 * человек читает и нажимает дольше секунды, а отсутствие сервисов даёт ошибку почти сразу.
 * Точным это различие не бывает, но ошибается оно безвредно: либо один лишний экран настроек,
 * либо молчание после отказа.
 */
export async function enableLocationFlow(deps: EnableLocationDeps): Promise<EnableOutcome> {
  const startedAt = deps.now();
  try {
    const result = await withTimeout(deps.requestDialog(), DIALOG_TIMEOUT_MS);
    if (result === TIMED_OUT) return openSettingsSafely(deps);
    // Окно сказало «включено»: на всякий случай проверяем, что это правда.
    return (await deps.isEnabled()) ? 'enabled' : openSettingsSafely(deps);
  } catch {
    const elapsed = deps.now() - startedAt;
    return elapsed < QUICK_FAIL_MS ? openSettingsSafely(deps) : 'declined';
  }
}
