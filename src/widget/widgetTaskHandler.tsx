import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { initDatabase, listSessionSummaries } from '../db/database';
import { weekSummary } from '../utils/weekSummary';
import { WEEK_WIDGET_NAME, WeekWidget } from './WeekWidget';

/** Свежая сводка недели из базы. База могла быть ещё не открыта: виджет живёт отдельно от экранов. */
async function loadWeek() {
  await initDatabase();
  return weekSummary(await listSessionSummaries(), Date.now());
}

/**
 * Обработчик виджета: система зовёт его, когда виджет добавили, пора обновить (раз в
 * полчаса, так настроено в `app.json`) или изменили размер. Работает в фоне, без экранов
 * приложения, поэтому всё читает из базы сам.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<WeekWidget week={await loadWeek()} />);
      break;
    default:
      break;
  }
}

/**
 * Перерисовывает виджет сразу после изменения истории (сохранили, удалили, загрузили
 * файл), не дожидаясь получасового обновления. Если виджета на рабочем столе нет, ничего
 * не делает. Ошибки глотаются: виджет не должен ломать сохранение тренировки.
 */
export function refreshWeekWidget(): void {
  requestWidgetUpdate({
    widgetName: WEEK_WIDGET_NAME,
    renderWidget: async () => <WeekWidget week={await loadWeek()} />,
  }).catch(() => {});
}
