import type { SensorContact } from './hrParser';

// Решает, читает ли ремень сердце на самом деле, пакет за пакетом.
//
// Нагрудный ремень, потерявший контакт с кожей, не обязательно перестаёт слать
// данные: он может повторять последний пульс (у Magene H64 так примерно минуту),
// пока не выключится. Такие пакеты выглядят как живые, поэтому их надо распознать
// и не пустить в статистику.

/**
 * Почему решено, что контакта нет:
 * - `no-signal`: пульс ниже `minValidBpm` (ремень шлёт 0, когда ничего не читает);
 * - `sensor-flag`: ремень сам сообщил о потере контакта;
 * - `no-rr`: ремень, который шлёт RR-интервалы, перестал присылать новые удары, а
 *   пульс не меняется;
 * - `flatline`: ремень без RR и без флага контакта слишком долго шлёт одно и то же.
 */
export type ContactLossReason = 'no-signal' | 'sensor-flag' | 'no-rr' | 'flatline';

/** Вердикт по одному пакету: есть ли контакт и, если нет, почему. */
export interface ContactVerdict {
  hasContact: boolean;
  reason: ContactLossReason | null;
}

/** То, что детектору нужно из пакета пульса. */
export interface ContactSample {
  bpm: number;
  rr: number[];
  contact: SensorContact;
}

/** Пороги детектора. Значения по умолчанию в `DEFAULT_CONTACT_OPTIONS`. */
export interface ContactDetectorOptions {
  /** Показания ниже этого значат «нет сигнала»: ремни шлют 0, когда ничего не читают. */
  minValidBpm: number;
  /**
   * Для ремня, который шлёт RR-интервалы: ни нового удара, ни изменения пульса за
   * это время значит «нет контакта». Одних RR мало: Magene H64 при слабом сигнале
   * по нескольку секунд не шлёт RR, продолжая мерить пульс. К тому же новый
   * интервал у него приходит примерно раз в 1.7 с, и при ровном пульсе короткое
   * окно срабатывало бы на ремне, который всё ещё на груди.
   */
  noRrTimeoutMs: number;
  /** Для ремня без RR и без флага контакта: пульс без изменений столько времени считается застывшим. */
  flatlineTimeoutMs: number;
  /** Сколько пакетов с новыми RR нужно, чтобы считать, что ремень умеет их слать. */
  rrCapableAfter: number;
}

/** Пороги, с которыми детектор работает в приложении. */
export const DEFAULT_CONTACT_OPTIONS: ContactDetectorOptions = {
  minValidBpm: 20,
  noRrTimeoutMs: 15000,
  flatlineTimeoutMs: 30000,
  rrCapableAfter: 3,
};

/** Детектор контакта с кожей для одного ремня. */
export interface ContactDetector {
  /** Учитывает пакет и выносит вердикт. Время передаётся явно, чтобы тесты могли им управлять. */
  push(sample: ContactSample, now: number): ContactVerdict;
  /**
   * Новое подключение к тому же ремню: выученное о нём (шлёт ли RR, сообщает ли о
   * контакте) сохраняется, а таймеры начинаются заново.
   */
  onConnected(now: number): void;
}

const CONTACT_OK: ContactVerdict = { hasContact: true, reason: null };

function lost(reason: ContactLossReason): ContactVerdict {
  return { hasContact: false, reason };
}

/** Одинаковы ли два списка RR-интервалов. */
function sameIntervals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Создаёт детектор. Знание о ремне (шлёт ли RR, сообщает ли о контакте) копится
 * внутри, поэтому на каждый ремень нужен свой детектор.
 */
export function createContactDetector(options: Partial<ContactDetectorOptions> = {}): ContactDetector {
  const opts: ContactDetectorOptions = { ...DEFAULT_CONTACT_OPTIONS, ...options };

  let freshRrNotifications = 0;
  let reportedContact = false;
  let lastFreshRrAt = 0;
  let previousRr: number[] = [];
  let lastBpm: number | null = null;
  let bpmChangedAt = 0;

  return {
    onConnected(now) {
      lastFreshRrAt = now;
      previousRr = [];
      lastBpm = null;
      bpmChangedAt = now;
    },

    push(sample, now) {
      if (sample.contact === 'detected') reportedContact = true;

      // Пакет, который лишь повторяет прошлый список RR, нового удара не несёт.
      const freshRr = sample.rr.length > 0 && !sameIntervals(sample.rr, previousRr);
      if (sample.rr.length > 0) previousRr = sample.rr;
      if (freshRr) {
        freshRrNotifications += 1;
        lastFreshRrAt = now;
      }

      if (sample.bpm !== lastBpm) {
        lastBpm = sample.bpm;
        bpmChangedAt = now;
      }

      const sendsRr = freshRrNotifications >= opts.rrCapableAfter;

      if (sample.bpm < opts.minValidBpm) return lost('no-signal');
      // Флагу «контакт потерян» верим, только если ремень вообще показал, что умеет о нём сообщать.
      if (sample.contact === 'lost' && reportedContact) return lost('sensor-flag');
      if (sendsRr && now - lastFreshRrAt > opts.noRrTimeoutMs && now - bpmChangedAt > opts.noRrTimeoutMs) {
        return lost('no-rr');
      }
      if (!sendsRr && sample.contact !== 'detected' && now - bpmChangedAt > opts.flatlineTimeoutMs) {
        return lost('flatline');
      }
      return CONTACT_OK;
    },
  };
}
