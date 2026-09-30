import type { IntervalSettings } from '../types';
import { decodeIntervalConfig } from './intervals';

// Шаблоны тренировок: сохранённые под своим названием настройки интервального таймера
// («Интервалы 6×400», «Табата на пресс»). Выбрал шаблон, и кроссфит стартует с ним.
// Чистый модуль без React Native, чтобы гонять в Jest.

/** Ключ флага со списком шаблонов. */
export const TEMPLATES_FLAG = 'timer_templates';

/** Предел длины названия: длиннее не влезет в чип. */
export const MAX_TEMPLATE_NAME = 30;

/** Шаблон: название и настройка таймера. */
export interface TimerTemplate {
  name: string;
  interval: IntervalSettings;
}

/** Шаблоны из флага. Битые записи отбрасываются поштучно. */
export function decodeTemplates(json: string | null): TimerTemplate[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: TimerTemplate[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const interval = decodeIntervalConfig(item.interval);
      if (name && interval) out.push({ name: name.slice(0, MAX_TEMPLATE_NAME), interval });
    }
    return out;
  } catch {
    return [];
  }
}

/** Шаблоны в строку для флага. */
export function encodeTemplates(templates: TimerTemplate[]): string {
  return JSON.stringify(templates);
}

/**
 * Добавляет шаблон. Шаблон с тем же названием (без учёта регистра) заменяется, а не
 * дублируется: два чипа с одним названием нельзя было бы различить.
 */
export function addTemplate(templates: TimerTemplate[], template: TimerTemplate): TimerTemplate[] {
  const name = template.name.trim().slice(0, MAX_TEMPLATE_NAME);
  if (!name) return templates;
  const rest = templates.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  return [...rest, { name, interval: template.interval }];
}

/** Убирает шаблон по названию. */
export function removeTemplate(templates: TimerTemplate[], name: string): TimerTemplate[] {
  return templates.filter((t) => t.name !== name);
}
