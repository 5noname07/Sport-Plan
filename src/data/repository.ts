import type { DataSet, Food, Profile, TrainingSet, Workout } from '../domain/types';
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
function db() {
  if (!supabase) throw new Error('请先配置 Supabase');
  return supabase;
}
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
async function userId() {
  const { data, error } = await db().auth.getUser();
  check(error);
  if (!data.user) throw new Error('登录已过期，请重新登录');
  return data.user.id;
}
interface Snapshot extends Omit<DataSet, 'workouts'> {
  workouts: Omit<Workout, 'exercises'>[];
  links: { id: string; workout_id: string; exercise_id: string; position: number }[];
  sets: (TrainingSet & { workout_exercise_id: string; position: number })[];
}
export const cloudRepository: Repository = {
  async load() {
    // A scalar RPC response avoids the default 1000-row API truncation and uses one DB snapshot.
    const { data, error } = await db().rpc('get_records');
    check(error);
    if (!data) throw new Error('未读取到数据库记录，请检查迁移是否完成');
    const { profile, body, exercises, workouts, links, sets, foods, days, entries } =
      data as Snapshot;
    const setsByExercise = new Map<string, Snapshot['sets']>();
    for (const set of sets) {
      const bucket = setsByExercise.get(set.workout_exercise_id) ?? [];
      bucket.push(set);
      setsByExercise.set(set.workout_exercise_id, bucket);
    }
    const linksByWorkout = new Map<string, Snapshot['links']>();
    for (const link of links) {
      const bucket = linksByWorkout.get(link.workout_id) ?? [];
      bucket.push(link);
      linksByWorkout.set(link.workout_id, bucket);
    }
    return {
      profile,
      body,
      exercises,
      foods,
      days,
      entries,
      workouts: workouts.map((w) => ({
        ...w,
        exercises: (linksByWorkout.get(w.id) ?? [])
          .sort((a, b) => Number(a.position) - Number(b.position))
          .map((l) => ({
            exercise_id: String(l.exercise_id),
            sets: (setsByExercise.get(l.id) ?? [])
              .sort((a, b) => Number(a.position) - Number(b.position))
              .map((s) => ({ weight_kg: Number(s.weight_kg), reps: Number(s.reps) })),
          })),
      })),
    };
  },
  async saveProfile(profile) {
    const { error } = await db()
      .from('profiles')
      .upsert({ ...profile, user_id: await userId() });
    check(error);
  },
  async saveWeight(date, weight, id) {
    const result = id
      ? await db()
          .from('body_records')
          .update({ date, weight_kg: weight })
          .eq('id', id)
          .select('id')
          .single()
      : await db()
          .from('body_records')
          .upsert(
            { user_id: await userId(), date, weight_kg: weight },
            { onConflict: 'user_id,date' },
          );
    check(result.error);
  },
  async deleteWeight(id) {
    const { error } = await db().from('body_records').delete().eq('id', id).select('id').single();
    check(error);
  },
  async saveExercise(name, id) {
    const result = id
      ? await db()
          .from('exercises')
          .update({ name: name.trim() })
          .eq('id', id)
          .select('id')
          .single()
      : await db()
          .from('exercises')
          .upsert(
            { user_id: await userId(), name: name.trim(), archived: false },
            { onConflict: 'user_id,name' },
          );
    check(result.error);
  },
  async archiveExercise(id) {
    const { error } = await db()
      .from('exercises')
      .update({ archived: true })
      .eq('id', id)
      .select('id')
      .single();
    check(error);
  },
  async saveWorkout(w) {
    const { error } = await db().rpc('save_workout', {
      p_date: w.date,
      p_duration: w.duration_minutes,
      p_notes: w.notes,
      p_exercises: w.exercises,
      p_revision: w.revision,
    });
    check(error);
  },
  async deleteWorkout(w) {
    const { error } = await db().rpc('delete_workout', { p_id: w.id, p_revision: w.revision });
    check(error);
  },
  async saveFood(food, id) {
    const result = id
      ? await db().from('foods').update(food).eq('id', id).select('id').single()
      : await db().from('foods').insert(food);
    check(result.error);
  },
  async archiveFood(id) {
    const { error } = await db()
      .from('foods')
      .update({ archived: true })
      .eq('id', id)
      .select('id')
      .single();
    check(error);
  },
  async saveMeal(date, foodId, grams, id) {
    const { error } = await db().rpc('save_meal_entry', {
      p_date: date,
      p_food_id: foodId,
      p_grams: grams,
      p_id: id ?? null,
    });
    check(error);
  },
  async deleteMeal(id) {
    const { error } = await db().from('meal_entries').delete().eq('id', id).select('id').single();
    check(error);
  },
};
