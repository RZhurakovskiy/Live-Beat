import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { getFlag, setFlag } from '../db/database';
import { colors, fonts, radii, spacing } from '../theme';
import { decodeGoals, encodeGoals, GOALS_FLAG, hasGoals, WeeklyGoals } from '../utils/goals';
import { SectionCard } from './SectionCard';

type Field = keyof WeeklyGoals;

const FIELDS: { key: Field; label: string; placeholder: string }[] = [
  { key: 'workouts', label: 'ТРЕНИРОВОК', placeholder: '3' },
  { key: 'km', label: 'КМ (УЛИЦА)', placeholder: '15' },
  { key: 'zone2Minutes', label: 'МИН В ЗОНЕ 2', placeholder: '90' },
];

/**
 * Секция «Цели на неделю» в настройках. Пустое поле значит «цели нет». Сохраняется по
 * уходу из поля, как и профиль: кнопки сохранения в настройках нет. Прогресс показывает
 * карточка «Эта неделя» в истории.
 */
export function GoalsSection() {
  // useState: значения полей рисуются в TextInput; строки, а не числа, чтобы поле можно
  // было очистить и набирать «1,5».
  const [values, setValues] = useState<Record<Field, string>>({ workouts: '', km: '', zone2Minutes: '' });
  // useState: от него зависит рамка «заполнено» у секции.
  const [saved, setSaved] = useState<WeeklyGoals | null>(null);

  useEffect(() => {
    getFlag(GOALS_FLAG).then((json) => {
      const goals = decodeGoals(json);
      setSaved(goals);
      setValues({
        workouts: goals.workouts !== null ? String(goals.workouts) : '',
        km: goals.km !== null ? String(goals.km) : '',
        zone2Minutes: goals.zone2Minutes !== null ? String(goals.zone2Minutes) : '',
      });
    });
  }, []);

  const persist = () => {
    const parse = (text: string) => {
      const n = Number(text.replace(',', '.'));
      return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
    };
    // Через decodeGoals, чтобы в базу попадали только те же правдоподобные значения,
    // которые потом из неё прочитаются.
    const goals = decodeGoals(
      encodeGoals({ workouts: parse(values.workouts), km: parse(values.km), zone2Minutes: parse(values.zone2Minutes) }),
    );
    setSaved(goals);
    setFlag(GOALS_FLAG, encodeGoals(goals)).catch(() => {});
  };

  return (
    <SectionCard label="ЦЕЛИ НА НЕДЕЛЮ" variant={saved && hasGoals(saved) ? 'complete' : 'plain'}>
      <View style={styles.row}>
        {FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.label}>{f.label}</Text>
            <TextInput
              style={styles.input}
              value={values[f.key]}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
              onBlur={persist}
              keyboardType="decimal-pad"
              placeholder={f.placeholder}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        Пустое поле - без цели. Прогресс виден в карточке «Эта неделя» в истории, неделя с понедельника.
      </Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
