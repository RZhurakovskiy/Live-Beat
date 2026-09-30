import {
  catchUpState,
  CoachInput,
  coachStep,
  CoachState,
  decodeVoiceSettings,
  DEFAULT_VOICE,
  encodeVoiceSettings,
  INITIAL_COACH,
  paceWords,
  VoiceSettings,
  ZONE_VOICE_COOLDOWN_MS,
  zoneDirection,
} from '../utils/voiceCoach';

const ON: VoiceSettings = { enabled: true, everyMinutes: 5, zoneAlerts: true };
const T0 = 1_700_000_000_000;

function input(extra: Partial<CoachInput> = {}): CoachInput {
  return {
    hasGps: true,
    distanceMeters: 0,
    activeMs: 0,
    bpm: 140,
    zoneIndex: 3,
    targetRange: null,
    now: T0,
    ...extra,
  };
}

/** Прогоняет несколько шагов подряд и собирает всё сказанное. */
function run(steps: Partial<CoachInput>[], settings = ON, from: CoachState = INITIAL_COACH) {
  let state = from;
  const said: string[] = [];
  for (const step of steps) {
    const out = coachStep(state, input(step), settings);
    state = out.state;
    said.push(...out.phrases);
  }
  return { state, said };
}

describe('voice settings', () => {
  it('round-trips', () => {
    const s: VoiceSettings = { enabled: true, everyMinutes: 10, zoneAlerts: false };
    expect(decodeVoiceSettings(encodeVoiceSettings(s))).toEqual(s);
  });
  it('falls back to defaults on garbage and unknown intervals', () => {
    expect(decodeVoiceSettings(null)).toEqual(DEFAULT_VOICE);
    expect(decodeVoiceSettings('{x')).toEqual(DEFAULT_VOICE);
    expect(decodeVoiceSettings(JSON.stringify({ enabled: true, everyMinutes: 7 })).everyMinutes).toBe(5);
  });
  it('is off by default', () => {
    expect(DEFAULT_VOICE.enabled).toBe(false);
  });
});

describe('paceWords', () => {
  it('says the pace in words the synthesiser reads clearly', () => {
    expect(paceWords(372)).toBe('6 минут 12 секунд');
    expect(paceWords(301)).toBe('5 минут 1 секунда');
    expect(paceWords(360)).toBe('6 минут');
    expect(paceWords(62)).toBe('1 минута 2 секунды');
  });
});

describe('coachStep, outdoor', () => {
  it('announces each kilometre with the pace of that kilometre', () => {
    const { said } = run([
      { distanceMeters: 500, activeMs: 180_000 },
      { distanceMeters: 1005, activeMs: 360_000 },
      { distanceMeters: 1500, activeMs: 540_000 },
      { distanceMeters: 2002, activeMs: 690_000, bpm: 150 },
    ]);
    expect(said).toEqual(['Километр 1. Темп 6 минут. Пульс 140.', 'Километр 2. Темп 5 минут 30 секунд. Пульс 150.']);
  });

  it('does not repeat a kilometre', () => {
    const { said } = run([
      { distanceMeters: 1001, activeMs: 360_000 },
      { distanceMeters: 1002, activeMs: 361_000 },
    ]);
    expect(said).toHaveLength(1);
  });

  it('skips the pulse when there is none', () => {
    const { said } = run([{ distanceMeters: 1000, activeMs: 300_000, bpm: null }]);
    expect(said).toEqual(['Километр 1. Темп 5 минут.']);
  });

  it('splits the time evenly when GPS jumped over several kilometres', () => {
    const { said } = run([{ distanceMeters: 2100, activeMs: 720_000 }]);
    expect(said[0]).toBe('Километр 2. Темп 6 минут. Пульс 140.');
  });
});

describe('coachStep, without GPS', () => {
  it('announces every N minutes with pulse and zone', () => {
    const { said } = run(
      [
        { hasGps: false, activeMs: 299_000 },
        { hasGps: false, activeMs: 300_500, bpm: 128, zoneIndex: 2 },
        { hasGps: false, activeMs: 450_000 },
        { hasGps: false, activeMs: 600_000, bpm: 131, zoneIndex: 2 },
      ],
    );
    expect(said).toEqual(['5 минут. Пульс 128. Зона 2.', '10 минут. Пульс 131. Зона 2.']);
  });

  it('uses the chosen interval', () => {
    const { said } = run(
      [
        { hasGps: false, activeMs: 60_000 },
        { hasGps: false, activeMs: 120_000 },
      ],
      { ...ON, everyMinutes: 1 },
    );
    expect(said).toEqual(['1 минута. Пульс 140. Зона 3.', '2 минуты. Пульс 140. Зона 3.']);
  });
});

describe('coachStep, target zone', () => {
  const target = { min: 2, max: 3 };

  it('speaks as soon as the pulse leaves the zone, then waits a minute', () => {
    const { said } = run([
      { zoneIndex: 3, targetRange: target, now: T0 },
      { zoneIndex: 4, targetRange: target, now: T0 + 1_000 },
      { zoneIndex: 4, targetRange: target, now: T0 + 30_000 },
      { zoneIndex: 4, targetRange: target, now: T0 + 1_000 + ZONE_VOICE_COOLDOWN_MS },
    ]);
    expect(said).toEqual(['Выше целевой зоны, сбавьте.', 'Выше целевой зоны, сбавьте.']);
  });

  it('speaks right away when the pulse jumps to the other side', () => {
    const { said } = run([
      { zoneIndex: 4, targetRange: target, now: T0 },
      { zoneIndex: 1, targetRange: target, now: T0 + 5_000 },
    ]);
    expect(said).toEqual(['Выше целевой зоны, сбавьте.', 'Ниже целевой зоны, прибавьте.']);
  });

  it('stays silent without a live pulse', () => {
    const { said } = run([
      { zoneIndex: 4, targetRange: target, now: T0 },
      { bpm: null, zoneIndex: null, targetRange: target, now: T0 + ZONE_VOICE_COOLDOWN_MS + 1 },
    ]);
    expect(said).toHaveLength(1);
  });

  it('can be switched off separately', () => {
    const { said } = run([{ zoneIndex: 5, targetRange: target }], { ...ON, zoneAlerts: false });
    expect(said).toEqual([]);
  });
});

describe('coachStep, disabled', () => {
  it('says nothing and keeps the state', () => {
    const out = coachStep(INITIAL_COACH, input({ distanceMeters: 5000, activeMs: 1_500_000 }), DEFAULT_VOICE);
    expect(out.phrases).toEqual([]);
    expect(out.state).toBe(INITIAL_COACH);
  });
});

describe('zoneDirection', () => {
  it('compares zone numbers with the target range', () => {
    expect(zoneDirection(4, { min: 2, max: 3 })).toBe('above');
    expect(zoneDirection(1, { min: 2, max: 3 })).toBe('below');
    expect(zoneDirection(2, { min: 2, max: 3 })).toBeNull();
    expect(zoneDirection(4, null)).toBeNull();
    expect(zoneDirection(null, { min: 2, max: 3 })).toBeNull();
  });
});

describe('catchUpState', () => {
  it('does not replay what was already run before the app came back', () => {
    const restored = input({ distanceMeters: 3200, activeMs: 1_200_000 });
    const state = catchUpState(restored, ON);
    expect(coachStep(state, restored, ON).phrases).toEqual([]);
    const next = coachStep(state, input({ distanceMeters: 4000, activeMs: 1_500_000 }), ON);
    expect(next.phrases).toEqual(['Километр 4. Темп 5 минут. Пульс 140.']);
  });

  it('catches up the minute intervals too', () => {
    const restored = input({ hasGps: false, activeMs: 11 * 60_000 });
    expect(catchUpState(restored, ON).announcedIntervals).toBe(2);
  });
});

describe('coachStep, cycling', () => {
  it('speaks every five kilometres with speed instead of pace', () => {
    const bike = { splitMeters: 5000, speed: 'speed' as const };
    const { said } = run([
      { ...bike, distanceMeters: 2500, activeMs: 375_000 },
      { ...bike, distanceMeters: 5010, activeMs: 750_000 },
    ]);
    expect(said).toEqual(['5 километров. Скорость 24 километра в час. Пульс 140.']);
  });

  it('catches up in five-kilometre steps', () => {
    const restored = input({ splitMeters: 5000, speed: 'speed', distanceMeters: 12_000, activeMs: 1_800_000 });
    expect(catchUpState(restored, ON).announcedKm).toBe(2);
  });
});
