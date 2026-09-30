import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatTotalTime } from '../utils/format';
import { WeekSummary } from '../utils/weekSummary';

// Цвета берутся строками из палитры `theme.ts`: примитивы виджета принимают только
// литералы `#rrggbb`, а сам виджет рисует не React Native, а система.
const BG = '#141517';
const ACCENT = '#FF8A3D';
const TEXT = '#F4F5F6';
const MUTED = '#9B9BA3';

/** Имя виджета, как оно прописано в плагине в `app.json`. */
export const WEEK_WIDGET_NAME = 'Week';

interface Props {
  week: WeekSummary;
}

/** Одна цифра виджета: значение и подпись под ним. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
      <TextWidget text={value} style={{ fontSize: 22, color: TEXT, fontWeight: '700' }} />
      <TextWidget text={label} style={{ fontSize: 11, color: MUTED }} />
    </FlexWidget>
  );
}

/**
 * Виджет «Эта неделя» на рабочий стол: тренировки, километры бега, общее время. Те же
 * цифры, что в карточке недели в истории (`utils/weekSummary.ts`). Тап открывает
 * приложение.
 */
export function WeekWidget({ week }: Props) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        borderRadius: 18,
        padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="● LIVEBEAT" style={{ fontSize: 11, color: ACCENT, fontWeight: '700' }} />
        <TextWidget text="Эта неделя" style={{ fontSize: 11, color: MUTED }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
        <Figure value={String(week.workouts)} label="тренировок" />
        <Figure value={(week.distanceMeters / 1000).toFixed(1)} label="км (улица)" />
        <Figure value={formatTotalTime(week.totalSeconds)} label="время" />
      </FlexWidget>
    </FlexWidget>
  );
}
