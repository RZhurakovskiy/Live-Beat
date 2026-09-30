import { HrSample, UserProfile } from '../types';

/**
 * Расход энергии в минуту по пульсу, весу, возрасту и полу: формула Keytel и
 * соавторов (2005). Она даёт кДж в минуту, отсюда деление на 4.184 в конце.
 */
function caloriesPerMinute(bpm: number, profile: UserProfile): number {
  const { weightKg, age, gender } = profile;

  const kcalPerMin =
    gender === 'female'
      ? -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.074 * age
      : -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * age;

  return Math.max(0, kcalPerMin) / 4.184;
}

/**
 * Калории за тренировку по показаниям пульса. Каждый промежуток между соседними
 * показаниями считается по пульсу в его конце; промежутки длиннее 5 минут (связь
 * пропадала) пропускаются. Без профиля или без данных `undefined`, а не ноль.
 */
export function computeCaloriesFromSamples(samples: HrSample[], profile: UserProfile | null): number | undefined {
  if (!profile || samples.length < 2) return undefined;

  let totalKcal = 0;
  for (let i = 1; i < samples.length; i++) {
    const dtMin = (samples[i].t - samples[i - 1].t) / 60000;
    if (dtMin <= 0 || dtMin > 5) continue;
    totalKcal += caloriesPerMinute(samples[i].bpm, profile) * dtMin;
  }
  return Math.round(totalKcal);
}
