import { describe, expect, it } from 'vitest';
import {
  cardioEnergy,
  cardioMetrics,
  cardioTotals,
  cardioTrend,
  formatPace,
} from '../src/domain/cardio';
import { DEFAULT_PROFILE, dailyNutritionTarget, nutritionTarget } from '../src/domain/calculations';
import { EMPTY_DATA, type CardioSession } from '../src/domain/types';
const cardio = (overrides: Partial<CardioSession> = {}): CardioSession => ({
  id: 'run',
  date: '2026-10-28',
  activity: 'running',
  start_time: null,
  duration_minutes: 30,
  distance_km: 5,
  average_heart_rate: null,
  notes: '',
  include_in_nutrition: true,
  revision: 1,
  ...overrides,
});
describe('有氧指标与综合营养目标', () => {
  it('跑步配速与骑行速度从距离/时长推导，缺失时不生成', () => {
    expect(cardioMetrics(cardio())).toEqual({ speedKmh: 10, paceMinutesPerKm: 6 });
    expect(formatPace(5.999)).toBe('6:00');
    expect(
      cardioMetrics(cardio({ activity: 'cycling', distance_km: 12, duration_minutes: 60 }))
        ?.speedKmh,
    ).toBe(12);
    expect(cardioMetrics(cardio({ distance_km: null }))).toBeNull();
    expect(cardioMetrics(cardio({ duration_minutes: null }))).toBeNull();
    expect(cardioMetrics(cardio({ activity: 'elliptical' }))).toBeNull();
  });
  it('多项同日有氧均计入，力量既有算法保持一致', () => {
    const rest = nutritionTarget(DEFAULT_PROFILE, 70, 0);
    const strength = nutritionTarget(DEFAULT_PROFILE, 70, 60);
    const run = cardio();
    const ride = cardio({ id: 'ride', activity: 'cycling', duration_minutes: 20 });
    const cardioOnly = nutritionTarget(DEFAULT_PROFILE, 70, 0, [run, ride]);
    const mixed = nutritionTarget(DEFAULT_PROFILE, 70, 60, [run, ride]);
    const expected = (((7.5 - 1) * 3.5 * 70) / 200) * 30 + (((4 - 1) * 3.5 * 70) / 200) * 20;
    expect(cardioOnly.calories - rest.calories).toBeCloseTo(expected);
    expect(mixed.calories - strength.calories).toBeCloseTo(expected);
    expect(mixed.strengthCalories).toBe(strength.trainingCalories);
    expect(mixed.protein).toBe(rest.protein);
    expect(mixed.carbs * 4 + mixed.protein * 4 + mixed.fat * 9).toBeCloseTo(mixed.calories);
  });
  it('日常活动已包含、缺少时长或未知运动不追加，不从心率/距离猜测', () => {
    for (const session of [
      cardio({ include_in_nutrition: false }),
      cardio({ duration_minutes: null }),
      cardio({ activity: 'other' }),
    ])
      expect(cardioEnergy(session, 70)).toBeNull();
    const baseline = nutritionTarget(DEFAULT_PROFILE, 70, 0);
    const actual = nutritionTarget(DEFAULT_PROFILE, 70, 0, [
      cardio({ include_in_nutrition: false }),
      cardio({ duration_minutes: null, average_heart_rate: 150 }),
      cardio({ activity: 'other' }),
    ]);
    expect(actual.calories).toBe(baseline.calories);
    expect(actual.unestimatedCardio).toBe(2);
    expect(
      cardioEnergy(cardio({ distance_km: null, average_heart_rate: null }), 70),
    ).toBeGreaterThan(0);
  });
  it('当天选择涵盖所有活动，增删改立即改变目标，不混入其他日期', () => {
    const data = structuredClone(EMPTY_DATA);
    data.profile = DEFAULT_PROFILE;
    data.body = [{ id: 'body', date: '2026-10-01', weight_kg: 70 }];
    const date = '2026-10-28';
    const baseline = dailyNutritionTarget(data, date)!.calories;
    data.cardio = [cardio(), cardio({ id: 'otherday', date: '2026-10-29' })];
    const added = dailyNutritionTarget(data, date)!.calories;
    expect(added - baseline).toBeCloseTo(cardioEnergy(cardio(), 70)!);
    data.cardio[0].duration_minutes = 60;
    expect(dailyNutritionTarget(data, date)!.calories - baseline).toBeCloseTo(
      2 * (added - baseline),
    );
    data.cardio.shift();
    expect(dailyNutritionTarget(data, date)!.calories).toBe(baseline);
    expect(dailyNutritionTarget(data, '2026-09-01')).toBeNull();
  });
  it('有氧汇总与每日趋势不把缺失测量值伪造为有效零值', () => {
    const sessions = [
      cardio(),
      cardio({ id: 'swim', distance_km: null, duration_minutes: null }),
      cardio({ id: 'old', date: '2026-10-01', duration_minutes: 20, distance_km: 2 }),
    ];
    expect(cardioTotals(sessions)).toEqual({
      count: 3,
      minutes: 50,
      distanceKm: 7,
      timed: 2,
      measured: 2,
    });
    expect(cardioTrend(sessions, '2026-10-20', '2026-10-30')).toEqual([
      { date: '2026-10-28', count: 2, minutes: 30, distanceKm: 5, timed: 1, measured: 1 },
    ]);
  });
});
