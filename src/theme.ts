// Токены оформления: цвета, шрифты, отступы, радиусы. Экраны и компоненты берут
// значения только отсюда и ничего не хардкодят.

/** Палитра приложения. Тема одна, тёмная. */
export const colors = {
  // поверхности
  background: '#0A0A0B',
  surface: '#141517',
  surfaceAlt: '#1E1F23',
  border: '#2A2B31',

  // смысловые акценты
  green: '#2FD673', // готово, успех, включено, точка логотипа
  accentStart: '#FF8A3D', // начало градиента (оранжевый)
  accentEnd: '#FF3B5C', // конец градиента (красный)
  danger: '#FF3B5C', // тревога, активное состояние
  amber: '#FFB23D', // предупреждение: связь потеряна, поиск GPS
  blue: '#3E9BFF', // зона 1, низкий пульс, восстановление
  blueLight: '#63B3FF',

  // текст
  textPrimary: '#F4F5F6',
  textSecondary: '#9B9BA3',
  textMuted: '#6B6C74',

  // Старые имена. `success` ещё используется в RouteMap, `info` нигде; в новом
  // коде писать `green` и `blue`.
  success: '#2FD673',
  info: '#3E9BFF',
} as const;

/** Градиенты. `accent` у главных кнопок и акцентов бренда, `blue` сейчас не используется. */
export const gradients = {
  accent: [colors.accentStart, colors.accentEnd] as const,
  blue: [colors.blueLight, colors.blue] as const,
};

/**
 * Баннеры состояний на экране активной тренировки: тонированный тёмный фон, цветная
 * иконка, яркий заголовок и приглушённый подзаголовок. По варианту на каждую
 * ситуацию из макетов.
 */
export const banners = {
  info: { background: '#152232', icon: colors.blue },
  warning: { background: '#2B2416', icon: colors.amber },
  danger: { background: '#331519', icon: colors.danger },
} as const;

/** Тон баннера состояния. */
export type BannerTone = keyof typeof banners;

/**
 * Начертания Manrope. Шрифт задаётся в каждом стиле явно: в RN 0.86 глобальная
 * подмена шрифта через `Text.render` не работает (tech-stack.md).
 */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

/** Шкала отступов. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Радиусы скругления. */
export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  // Нажимаемые элементы: кнопки, чипы, сегменты. Решение владельца после
  // полевого теста: «таблетки» смотрелись слишком мягко, радиус 10 везде.
  button: 10,
  // Только то, что круглое по геометрии (точки, кольца, круглая кнопка паузы),
  // и бейджи-ярлыки. Кнопкам этот радиус не давать.
  pill: 999,
} as const;

/** Готовые текстовые стили для крупных цифр, заголовков и подписей. */
export const typography = {
  hero: { fontFamily: fonts.extrabold, fontSize: 56, fontWeight: '800' as const },
  title: { fontFamily: fonts.extrabold, fontSize: 28, fontWeight: '800' as const },
  heading: { fontFamily: fonts.bold, fontSize: 20, fontWeight: '700' as const },
  body: { fontFamily: fonts.medium, fontSize: 15, fontWeight: '500' as const },
  label: { fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' as const },
  caption: { fontFamily: fonts.semibold, fontSize: 12, fontWeight: '600' as const },
};
