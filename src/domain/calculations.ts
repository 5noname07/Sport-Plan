import type {
  BodyRecord,
  CardioSession,
  DataSet,
  Food,
  Macros,
  Profile,
  TrainingSet,
  Workout,
} from './types';
import { cardioEnergy, dayTraining } from './cardio';

export const NUTRITION_PARAMETERS = {
  // Mifflin & St Jeor (1990), PMID 2305711; kcal/day, kg, cm, years.
  weightCoefficient: 10,
  heightCoefficient: 6.25,
  ageCoefficient: 5,
  maleOffset: 5,
  femaleOffset: -161,
  // These are configurable practical PAL approximations, excluding deliberate workouts.
  activityFactors: [1.2, 1.4, 1.6],
  // ISSN 2017: most exercising adults 1.4–2.0 g/kg/day. Default 1.6.
  defaultProteinPerKg: 1.6,
  defaultFatFraction: 0.3,
  // Adult Compendium 2024 code 02054: varied-resistance training = 3.5 MET.
  // Subtract 1 MET (rest) because baseline TDEE already includes resting expenditure.
  resistanceMET: 3.5,
  kcalPerGramProtein: 4,
  kcalPerGramCarbs: 4,
  kcalPerGramFat: 9,
} as const;
export const DEFAULT_PROFILE: Profile = {
  height_cm: 170,
  age: 30,
  sex: 'male',
  activity_factor: 1.2,
  protein_per_kg: NUTRITION_PARAMETERS.defaultProteinPerKg,
  fat_fraction: NUTRITION_PARAMETERS.defaultFatFraction,
};
export function workoutTotals(sets: TrainingSet[]) {
  return sets.reduce(
    (a, s) => ({
      sets: a.sets + 1,
      reps: a.reps + s.reps,
      volume: a.volume + s.weight_kg * s.reps,
      maxWeight: Math.max(a.maxWeight, s.weight_kg),
    }),
    { sets: 0, reps: 0, volume: 0, maxWeight: 0 },
  );
}
export function scaleFood(food: Pick<Food, keyof Macros | 'base_grams'>, grams: number): Macros {
  if (!Number.isFinite(grams) || grams <= 0 || food.base_grams <= 0)
    throw new Error('食品重量必须大于 0');
  const ratio = grams / food.base_grams;
  return {
    calories: food.calories * ratio,
    protein: food.protein * ratio,
    carbs: food.carbs * ratio,
    fat: food.fat * ratio,
  };
}
export function sumNutrition(entries: Macros[]): Macros {
  return entries.reduce(
    (a, b) => ({
      calories: a.calories + b.calories,
      protein: a.protein + b.protein,
      carbs: a.carbs + b.carbs,
      fat: a.fat + b.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function nutritionTarget(
  profile: Profile,
  weight: number,
  durationMinutes: number,
  cardio: CardioSession[] = [],
) {
  if (weight <= 0 || profile.height_cm <= 0 || profile.age < 18 || durationMinutes < 0)
    throw new Error('请填写有效的成人身体信息和训练时长');
  const p = NUTRITION_PARAMETERS;
  const bmr =
    p.weightCoefficient * weight +
    p.heightCoefficient * profile.height_cm -
    p.ageCoefficient * profile.age +
    (profile.sex === 'male' ? p.maleOffset : p.femaleOffset);
  const strengthCalories = (((p.resistanceMET - 1) * 3.5 * weight) / 200) * durationMinutes;
  const cardioCalories = cardio.reduce(
    (sum, session) => sum + (cardioEnergy(session, weight) ?? 0),
    0,
  );
  const trainingCalories = strengthCalories + cardioCalories;
  const baseCalories = bmr * profile.activity_factor;
  const calories = baseCalories + trainingCalories;
  const protein = weight * profile.protein_per_kg;
  const fat = (calories * profile.fat_fraction) / p.kcalPerGramFat;
  const carbs = Math.max(
    0,
    (calories - protein * p.kcalPerGramProtein - fat * p.kcalPerGramFat) / p.kcalPerGramCarbs,
  );
  return {
    calories,
    protein,
    fat,
    carbs,
    bmr,
    trainingCalories,
    baseCalories,
    strengthCalories,
    cardioCalories,
    unestimatedCardio: cardio.filter(
      (s) => s.include_in_nutrition && cardioEnergy(s, weight) === null,
    ).length,
  };
}
export type NutritionTarget = ReturnType<typeof nutritionTarget>;
export function dailyNutritionTarget(data: DataSet, date: string) {
  const weight = weightOnDate(data.body, date);
  if (!data.profile || !weight) return null;
  const activities = dayTraining(data, date);
  return nutritionTarget(
    data.profile,
    weight,
    activities.strength.reduce((sum, w) => sum + w.duration_minutes, 0),
    activities.cardio,
  );
}
export function weightOnDate(records: BodyRecord[], date: string) {
  return records.filter((r) => r.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
    ?.weight_kg;
}
export function exerciseTrend(workouts: Workout[], exerciseId: string, start: string, end: string) {
  return workouts
    .filter((w) => w.date >= start && w.date <= end)
    .map((w) => ({
      date: w.date,
      ...workoutTotals(
        w.exercises.filter((e) => e.exercise_id === exerciseId).flatMap((e) => e.sets),
      ),
    }))
    .filter((w) => w.sets > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
// Browser local calendar date: never derive the date from UTC ISO (wrong near midnight).
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
