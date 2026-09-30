import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getFlag, setFlag } from '../db/database';
import { colors, fonts, radii, spacing } from '../theme';
import { IntervalSettings } from '../types';
import { formatDuration } from '../utils/format';
import { describeConfig, isValidConfig, presetConfig, PRESET_TITLES, totalIntervalMs } from '../utils/intervals';
import { addTemplate, decodeTemplates, encodeTemplates, removeTemplate, TEMPLATES_FLAG, TimerTemplate } from '../utils/templates';
import { SectionCard } from './SectionCard';

interface Props {
  value: IntervalSettings;
  onChange: (value: IntervalSettings) => void;
}

const MINUTES = [5, 10, 15, 20] as const;

/**
 * Настройка интервального таймера на экране режима (вид «Кроссфит»): пресеты Tabata,
 * EMOM, AMRAP, свои интервалы и сохранённые шаблоны. Таймер стартует вместе с
 * тренировкой.
 */
export function IntervalCard({ value, onChange }: Props) {
  // useState: шаблоны рисуются чипами; поля своих интервалов строками, чтобы их можно было
  // стирать и набирать; название нового шаблона в поле ввода.
  const [templates, setTemplates] = useState<TimerTemplate[]>([]);
  const [custom, setCustom] = useState({ work: '40', rest: '20', rounds: '6' });
  const [name, setName] = useState('');

  useEffect(() => {
    getFlag(TEMPLATES_FLAG).then((json) => setTemplates(decodeTemplates(json)));
  }, []);

  const persistTemplates = (next: TimerTemplate[]) => {
    setTemplates(next);
    setFlag(TEMPLATES_FLAG, encodeTemplates(next)).catch(() => {});
  };

  // Длина EMOM и AMRAP в минутах; у остальных пресетов её нет, и при переходе на EMOM
  // или AMRAP берутся 10 минут, а не восемь раундов Табаты.
  const minutes = value.preset === 'amrap' ? Math.round(value.workSec / 60) : value.preset === 'emom' ? value.rounds : 10;

  const applyCustom = (next: typeof custom) => {
    setCustom(next);
    onChange({ preset: 'custom', workSec: Number(next.work), restSec: Number(next.rest), rounds: Number(next.rounds) });
  };

  const handleSaveTemplate = () => {
    if (!isValidConfig(value)) return;
    persistTemplates(addTemplate(templates, { name, interval: value }));
    setName('');
  };

  const handleTemplateLongPress = (template: TimerTemplate) => {
    Alert.alert('Удалить шаблон?', `«${template.name}» пропадёт из списка.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => persistTemplates(removeTemplate(templates, template.name)) },
    ]);
  };

  const valid = isValidConfig(value);

  return (
    <SectionCard label="ИНТЕРВАЛЬНЫЙ ТАЙМЕР">
      <View style={styles.chips}>
        {(['tabata', 'emom', 'amrap', 'custom'] as const).map((preset) => (
          <Chip
            key={preset}
            label={PRESET_TITLES[preset]}
            active={value.preset === preset}
            onPress={() =>
              preset === 'custom'
                ? applyCustom(custom)
                : onChange(preset === 'tabata' ? presetConfig('tabata') : presetConfig(preset, minutes))
            }
          />
        ))}
      </View>

      {(value.preset === 'emom' || value.preset === 'amrap') && (
        <View style={styles.chips}>
          {MINUTES.map((m) => (
            <Chip
              key={m}
              label={`${m} мин`}
              active={minutes === m}
              onPress={() => onChange(presetConfig(value.preset as 'emom' | 'amrap', m))}
            />
          ))}
        </View>
      )}

      {value.preset === 'custom' && (
        <View style={styles.fields}>
          <Field label="РАБОТА, С" value={custom.work} onChange={(work) => applyCustom({ ...custom, work })} />
          <Field label="ОТДЫХ, С" value={custom.rest} onChange={(rest) => applyCustom({ ...custom, rest })} />
          <Field label="РАУНДЫ" value={custom.rounds} onChange={(rounds) => applyCustom({ ...custom, rounds })} />
        </View>
      )}

      <Text style={[styles.summary, !valid && styles.invalid]}>
        {valid
          ? `${describeConfig(value)} · всего ${formatDuration(totalIntervalMs(value) / 1000)}`
          : 'Работа от 5 с, раундов от 1 до 100.'}
      </Text>

      {templates.length > 0 && (
        <>
          <Text style={styles.label}>ШАБЛОНЫ (УДЕРЖИВАЙТЕ, ЧТОБЫ УДАЛИТЬ)</Text>
          <View style={styles.chips}>
            {templates.map((t) => (
              <Chip
                key={t.name}
                label={t.name}
                active={false}
                onPress={() => {
                  onChange(t.interval);
                  if (t.interval.preset === 'custom') {
                    setCustom({
                      work: String(t.interval.workSec),
                      rest: String(t.interval.restSec),
                      rounds: String(t.interval.rounds),
                    });
                  }
                }}
                onLongPress={() => handleTemplateLongPress(t)}
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.saveRow}>
        <TextInput
          style={[styles.input, styles.nameInput]}
          value={name}
          onChangeText={setName}
          placeholder="Название шаблона"
          placeholderTextColor={colors.textMuted}
          maxLength={30}
        />
        <TouchableOpacity
          style={[styles.saveButton, (!name.trim() || !valid) && styles.disabled]}
          disabled={!name.trim() || !valid}
          onPress={handleSaveTemplate}
        >
          <Text style={styles.saveLabel}>Сохранить</Text>
        </TouchableOpacity>
      </View>
    </SectionCard>
  );
}

function Chip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    borderColor: colors.danger,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.textPrimary,
  },
  fields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    gap: spacing.xs,
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
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  summary: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  invalid: {
    color: colors.amber,
  },
  saveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
  },
  saveButton: {
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: colors.accentStart,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disabled: {
    opacity: 0.4,
  },
  saveLabel: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
  },
});
