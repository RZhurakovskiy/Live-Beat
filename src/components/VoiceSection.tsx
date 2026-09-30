import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { VOICE_INTERVALS, VoiceSettings } from '../utils/voiceCoach';
import { getVoiceSettings, hasRussianVoice, saveVoiceSettings, say } from '../workout/voiceCoach';
import { SectionCard } from './SectionCard';

/**
 * Секция «Голосовые подсказки» в настройках. Здесь настоящий переключатель уместен, в
 * отличие от разрешений: это двусторонняя настройка самого приложения, её можно и
 * включить, и выключить.
 */
export function VoiceSection() {
  // useState: переключатели и выбранный интервал рисуются на экране.
  const [settings, setSettings] = useState<VoiceSettings>(getVoiceSettings);
  // useState: предупреждение про русский голос показывается, только если его точно нет.
  const [russian, setRussian] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings.enabled) hasRussianVoice().then(setRussian);
  }, [settings.enabled]);

  const update = (patch: Partial<VoiceSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveVoiceSettings(next).catch(() => {});
  };

  return (
    <SectionCard label="ГОЛОСОВЫЕ ПОДСКАЗКИ" variant={settings.enabled ? 'complete' : 'plain'}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>Говорить на тренировке</Text>
          <Text style={styles.description}>
            На улице каждый километр: темп и пульс. Без GPS каждые несколько минут. Работает и с
            заблокированным экраном.
          </Text>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={(enabled) => update({ enabled })}
          trackColor={{ false: colors.surfaceAlt, true: colors.green }}
          thumbColor={colors.textPrimary}
        />
      </View>

      {settings.enabled && (
        <>
          <Text style={styles.label}>БЕЗ GPS: КАЖДЫЕ</Text>
          <View style={styles.chips}>
            {VOICE_INTERVALS.map((minutes) => (
              <TouchableOpacity
                key={minutes}
                style={[styles.chip, settings.everyMinutes === minutes && styles.chipActive]}
                onPress={() => update({ everyMinutes: minutes })}
              >
                <Text style={[styles.chipLabel, settings.everyMinutes === minutes && styles.chipLabelActive]}>
                  {minutes} мин
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.title}>Сигнал целевой зоны голосом</Text>
              <Text style={styles.description}>«Выше целевой зоны, сбавьте» в дополнение к вибрации.</Text>
            </View>
            <Switch
              value={settings.zoneAlerts}
              onValueChange={(zoneAlerts) => update({ zoneAlerts })}
              trackColor={{ false: colors.surfaceAlt, true: colors.green }}
              thumbColor={colors.textPrimary}
            />
          </View>

          <TouchableOpacity
            style={styles.test}
            activeOpacity={0.85}
            onPress={() => say('Километр 1. Темп 6 минут 12 секунд. Пульс 148.')}
          >
            <Text style={styles.testLabel}>Проверить голос</Text>
          </TouchableOpacity>

          {russian === false && (
            <Text style={styles.warning}>
              На телефоне нет русского голоса. Установите его в настройках Android: «Синтез речи» или «Преобразование
              текста в речь».
            </Text>
          )}
        </>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.green,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.textPrimary,
  },
  test: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  testLabel: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  warning: {
    color: colors.amber,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
