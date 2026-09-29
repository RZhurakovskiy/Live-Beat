export const colors = {
  // base surfaces
  background: '#0A0A0B',
  surface: '#141517',
  surfaceAlt: '#1E1F23',
  border: '#2A2B31',

  // semantic accents
  green: '#2FD673', // valid / success / toggle-on / logo dot
  accentStart: '#FF8A3D', // gradient start (orange)
  accentEnd: '#FF3B5C', // gradient end (red)
  danger: '#FF3B5C', // alert / active
  amber: '#FFB23D', // warning: link lost, GPS searching
  blue: '#3E9BFF', // zone 1 / low / recovery
  blueLight: '#63B3FF',

  // text
  textPrimary: '#F4F5F6',
  textSecondary: '#9B9BA3',
  textMuted: '#6B6C74',

  // legacy aliases (kept so existing screens keep compiling)
  success: '#2FD673',
  info: '#3E9BFF',
} as const;

export const gradients = {
  accent: [colors.accentStart, colors.accentEnd] as const,
  blue: [colors.blueLight, colors.blue] as const,
};

// State banners on the active-workout screen. Tinted dark background, coloured
// icon, bright title, muted subtitle — one entry per situation the mockups draw.
export const banners = {
  info: { background: '#152232', icon: colors.blue },
  warning: { background: '#2B2416', icon: colors.amber },
  danger: { background: '#331519', icon: colors.danger },
} as const;

export type BannerTone = keyof typeof banners;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  hero: { fontFamily: fonts.extrabold, fontSize: 56, fontWeight: '800' as const },
  title: { fontFamily: fonts.extrabold, fontSize: 28, fontWeight: '800' as const },
  heading: { fontFamily: fonts.bold, fontSize: 20, fontWeight: '700' as const },
  body: { fontFamily: fonts.medium, fontSize: 15, fontWeight: '500' as const },
  label: { fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' as const },
  caption: { fontFamily: fonts.semibold, fontSize: 12, fontWeight: '600' as const },
};
