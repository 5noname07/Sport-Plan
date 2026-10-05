import type { Repository } from './repository';
import { localDate, scaleFood } from '../domain/calculations';
import { EMPTY_DATA, type DataSet } from '../domain/types';
// Explicit preview only: no localStorage and no illusion of durable or cloud-synced data.
export function createPreviewRepository(): Repository {
  const today = localDate();
  const data: DataSet = structuredClone(EMPTY_DATA);
  data.profile = { height_cm: 175, age: 28, sex: 'male', activity_factor: 1.2, protein_per_kg: 1.6, fat_fraction: 0.3 };
  data.body = [{ id: 'body', date: today, weight_kg: 70 }];
  data.exercises = ['卧推', '深蹲', '硬拉', '哑铃弯举', '引体向上'].map((name,i) => ({ id: `ex-${i}`, name, archived: false }));
  data.foods = [
    { id: 'chicken', name: '鸡胸肉（熟）', base_grams: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6, archived: false },
    { id: 'rice', name: '米饭（熟）', base_grams: 100, calories: 116, protein: 2.6, carbs: 25.9, fat: 0.3, archived: false },
  ];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i*7);
    data.workouts.push({ id: `workout-${i}`, date: localDate(date), revision: 1, duration_minutes: 45, notes: '',
      exercises: [{ exercise_id: 'ex-0', sets: [{ weight_kg: 50 + (6-i)*2.5, reps: 10 }, { weight_kg: 55+(6-i)*2.5, reps: 8 }] }] });
  }
  const id = () => crypto.randomUUID();
  return {
    async load() { return structuredClone(data); },
    async saveProfile(profile) { data.profile = profile; },
    async saveWeight(date, weight, recordId) {
      const record = data.body.find(r => recordId ? r.id === recordId : r.date === date);
      if (record) { record.date = date; record.weight_kg = weight; } else data.body.push({ id: id(), date, weight_kg: weight });
    },
    async deleteWeight(recordId) { data.body = data.body.filter(r => r.id !== recordId); },
    async saveExercise(name, recordId) {
      if (recordId) data.exercises.find(e => e.id === recordId)!.name = name;
      else data.exercises.push({ id: id(), name, archived: false });
    },
    async archiveExercise(recordId) { data.exercises.find(e => e.id === recordId)!.archived = true; },
    async saveWorkout(workout) {
      const old = data.workouts.find(w => w.date === workout.date);
      if ((old?.revision ?? 0) !== workout.revision) throw new Error('记录已改变，请刷新后重试');
      const saved = structuredClone({ ...workout, id: old?.id ?? id(), revision: workout.revision+1 });
      data.workouts = [...data.workouts.filter(w => w.date !== workout.date), saved];
    },
    async deleteWorkout(workout) { data.workouts = data.workouts.filter(w => w.id !== workout.id); },
    async saveFood(food, recordId) {
      if (recordId) Object.assign(data.foods.find(f => f.id === recordId)!,food);
      else data.foods.push({ ...food, id: id(), archived: false });
    },
    async archiveFood(recordId) { data.foods.find(f => f.id === recordId)!.archived = true; },
    async saveMeal(date, foodId, grams, recordId) {
      if (recordId) {
        const entry = data.entries.find(e => e.id === recordId)!;
        const ratio = grams/entry.grams;
        entry.calories *= ratio; entry.protein *= ratio; entry.carbs *= ratio; entry.fat *= ratio; entry.grams = grams;
      } else {
        let day = data.days.find(d => d.date === date);
        if (!day) { day = { id: id(), date }; data.days.push(day); }
        const food = data.foods.find(f => f.id === foodId)!;
        data.entries.push({ id: id(), day_id: day.id, food_id: foodId, grams, food_name: food.name, created_at: new Date().toISOString(), ...scaleFood(food,grams) });
      }
    },
    async deleteMeal(recordId) { data.entries = data.entries.filter(e => e.id !== recordId); },
  };
}
