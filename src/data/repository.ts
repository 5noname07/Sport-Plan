import type { BodyRecord, DataSet, Food, Profile, Workout } from '../domain/types';
import { supabase } from './client';

export interface Repository {
  load(): Promise<DataSet>;
  saveProfile(profile: Profile): Promise<void>;
  saveWeight(date: string, weight: number, id?: string): Promise<void>;
  deleteWeight(id: string): Promise<void>;
  saveExercise(name: string, id?: string): Promise<void>;
  archiveExercise(id: string): Promise<void>;
  saveWorkout(workout: Workout): Promise<void>;
  deleteWorkout(workout: Workout): Promise<void>;
  saveFood(food: Omit<Food, 'id' | 'archived'>, id?: string): Promise<void>;
  archiveFood(id: string): Promise<void>;
  saveMeal(date: string, foodId: string, grams: number, id?: string): Promise<void>;
  deleteMeal(id: string): Promise<void>;
}
function db() { if (!supabase) throw new Error('请先配置 Supabase'); return supabase; }
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function userId() {
  const { data, error } = await db().auth.getUser(); check(error);
  if (!data.user) throw new Error('登录已过期，请重新登录');
  return data.user.id;
}
// Supabase defaults to 1000 rows per response. Page every table so old records are never silently lost.
async function allRows(table: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db().from(table).select('*').order('id').range(offset, offset + 499);
    check(error); rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
export const cloudRepository: Repository = {
  async load() {
    const [profile, body, exercises, workouts, links, sets, foods, days, entries] = await Promise.all([
      db().from('profiles').select('*').maybeSingle(), allRows('body_records'), allRows('exercises'),
      allRows('workouts'), allRows('workout_exercises'), allRows('training_sets'), allRows('foods'), allRows('meal_days'), allRows('meal_entries'),
    ]);
    check(profile.error);
    return {
      profile: profile.data as Profile | null,
      body: body as unknown as BodyRecord[], exercises: exercises as unknown as DataSet['exercises'],
      foods: foods as unknown as Food[], days: days as unknown as DataSet['days'], entries: entries as unknown as DataSet['entries'],
      workouts: workouts.map(w => ({ ...w, exercises: links.filter(l => l.workout_id === w.id)
        .sort((a,b) => Number(a.position)-Number(b.position)).map(l => ({ exercise_id: String(l.exercise_id),
          sets: sets.filter(s => s.workout_exercise_id === l.id).sort((a,b) => Number(a.position)-Number(b.position))
            .map(s => ({ weight_kg: Number(s.weight_kg), reps: Number(s.reps) })) })) })) as Workout[],
    };
  },
  async saveProfile(profile) { const { error } = await db().from('profiles').upsert({ ...profile, user_id: await userId() }); check(error); },
  async saveWeight(date, weight, id) {
    const result = id ? await db().from('body_records').update({ date, weight_kg: weight }).eq('id',id)
      : await db().from('body_records').upsert({ user_id: await userId(), date, weight_kg: weight }, { onConflict: 'user_id,date' });
    check(result.error);
  },
  async deleteWeight(id) { const { error } = await db().from('body_records').delete().eq('id',id); check(error); },
  async saveExercise(name, id) {
    const result = id ? await db().from('exercises').update({ name: name.trim() }).eq('id', id)
      : await db().from('exercises').insert({ name: name.trim() }); check(result.error);
  },
  async archiveExercise(id) { const { error } = await db().from('exercises').update({ archived: true }).eq('id',id); check(error); },
  async saveWorkout(w) {
    const { error } = await db().rpc('save_workout', { p_date: w.date, p_duration: w.duration_minutes,
      p_notes: w.notes, p_exercises: w.exercises, p_revision: w.revision }); check(error);
  },
  async deleteWorkout(w) { const { error } = await db().rpc('delete_workout', { p_id: w.id, p_revision: w.revision }); check(error); },
  async saveFood(food, id) {
    const result = id ? await db().from('foods').update(food).eq('id',id) : await db().from('foods').insert(food); check(result.error);
  },
  async archiveFood(id) { const { error } = await db().from('foods').update({ archived: true }).eq('id',id); check(error); },
  async saveMeal(date, foodId, grams, id) {
    const { error } = await db().rpc('save_meal_entry', { p_date: date, p_food_id: foodId, p_grams: grams, p_id: id ?? null }); check(error);
  },
  async deleteMeal(id) { const { error } = await db().from('meal_entries').delete().eq('id',id); check(error); },
};
