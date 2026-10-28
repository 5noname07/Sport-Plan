import type { CardioActivity, CardioSession, DataSet } from './types';

// Explicit activity assumptions, not inferred intensities or heart-rate calorie estimates.
// 2024 Adult Compendium: https://pacompendium.com/ (activity codes below).
export const CARDIO_ACTIVITIES: Record<
  CardioActivity,
  {
    label: string;
    assumption: string;
    met: number | null;
    code: string;
    distance: boolean;
  }
> = {
  running: {
    label: '跑步',
    assumption: '一般慢跑，自选配速',
    met: 7.5,
    code: '12020',
    distance: true,
  },
  cycling: {
    label: '骑行',
    assumption: '休闲骑行，低于约 16 km/h',
    met: 4,
    code: '01010',
    distance: true,
  },
  swimming: {
    label: '游泳',
    assumption: '休闲自由泳，较慢强度',
    met: 5.8,
    code: '18240',
    distance: true,
  },
  elliptical: { label: '椭圆机', assumption: '中等强度', met: 5, code: '02048', distance: false },
  walking: {
    label: '步行',
    assumption: '专门运动步行，非日常走动',
    met: 3.5,
    code: '17160',
    distance: true,
  },
  other: {
    label: '其他有氧',
    assumption: '缺少可靠的运动强度参数，不估算热量',
    met: null,
    code: '',
    distance: false,
  },
};
export function cardioEnergy(session: CardioSession, weight: number): number | null {
  const met = CARDIO_ACTIVITIES[session.activity]?.met;
  if (
    !session.include_in_nutrition ||
    !met ||
    !session.duration_minutes ||
    !Number.isFinite(session.duration_minutes) ||
    session.duration_minutes <= 0 ||
    !Number.isFinite(weight) ||
    weight <= 0
  )
    return null;
  // Net MET removes rest energy already present in baseline TDEE.
  return (((met - 1) * 3.5 * weight) / 200) * session.duration_minutes;
}
export function cardioMetrics(
  session: Pick<CardioSession, 'distance_km' | 'duration_minutes' | 'activity'>,
) {
  const { distance_km: distance, duration_minutes: duration } = session;
  if (
    !CARDIO_ACTIVITIES[session.activity].distance ||
    !distance ||
    distance <= 0 ||
    !duration ||
    duration <= 0
  )
    return null;
  return { speedKmh: (distance / duration) * 60, paceMinutesPerKm: duration / distance };
}
export function formatPace(minutes: number) {
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function cardioTotals(sessions: CardioSession[]) {
  return sessions.reduce(
    (total, s) => ({
      count: total.count + 1,
      minutes: total.minutes + (s.duration_minutes ?? 0),
      distanceKm: total.distanceKm + (s.distance_km ?? 0),
      timed: total.timed + (s.duration_minutes !== null ? 1 : 0),
      measured: total.measured + (s.distance_km !== null ? 1 : 0),
    }),
    { count: 0, minutes: 0, distanceKm: 0, timed: 0, measured: 0 },
  );
}
export function cardioTrend(sessions: CardioSession[], start: string, end: string) {
  const dates = [
    ...new Set(sessions.filter((s) => s.date >= start && s.date <= end).map((s) => s.date)),
  ].sort();
  return dates.map((date) => ({ date, ...cardioTotals(sessions.filter((s) => s.date === date)) }));
}
export function dayTraining(data: DataSet, date: string) {
  return {
    strength: data.workouts.filter((w) => w.date === date),
    cardio: data.cardio.filter((s) => s.date === date),
  };
}
