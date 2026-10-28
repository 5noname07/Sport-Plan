import type {
  CardioSession,
  DataSet,
  Food,
  Profile,
  SessionKind,
  TrainingSet,
  Workout,
} from '../domain/types';
import { supabase } from './client';

export interface Repository {
  load(): Promise<DataSet>;
  saveProfile(profile: Profile): Promise<void>;
  saveWeight(date: string, weight: number, id?: string): Promise<void>;
  deleteWeight(id: string): Promise<void>;
  saveExercise(name: string, id?: string, notes?: string): Promise<void>;
  saveExerciseNotes(id: string, notes: string): Promise<void>;
  saveTrainingNotes(kind: SessionKind, id: string, notes: string, revision: number): Promise<void>;
  saveCardio(session: CardioSession): Promise<void>;
  deleteCardio(session: CardioSession): Promise<void>;
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
  schema_version?: number;
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
    if (data.schema_version !== 2)
      throw new Error(
        '数据库需要升级：请在 Supabase 执行 002_notes_and_cardio.sql，然后刷新。原数据不会被删除。',
      );
    const { profile, body, exercises, workouts, links, sets, foods, days, entries, cardio } =
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
      exercises: exercises.map((e) => ({ ...e, notes: e.notes ?? '' })),
      cardio: cardio ?? [],
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
  async saveExercise(name, id, notes) {
    const { error } = await db().rpc('save_exercise', {
      p_name: name,
      p_id: id ?? null,
      p_notes: notes ?? null,
    });
    check(error);
  },
  async saveExerciseNotes(id, notes) {
    const { error } = await db()
      .from('exercises')
      .update({ notes })
      .eq('id', id)
      .select('id')
      .single();
    check(error);
  },
  async saveTrainingNotes(kind, id, notes, revision) {
    const { error } = await db().rpc('update_training_notes', {
      p_kind: kind,
      p_id: id,
      p_notes: notes,
      p_revision: revision,
    });
    check(error);
  },
  async saveCardio(session) {
    const { error } = await db().rpc('save_cardio', {
      p_id: session.id,
      p_revision: session.revision,
      p_date: session.date,
      p_start_time: session.start_time,
      p_activity: session.activity,
      p_duration: session.duration_minutes,
      p_distance: session.distance_km,
      p_heart_rate: session.average_heart_rate,
      p_notes: session.notes,
      p_include: session.include_in_nutrition,
    });
    check(error);
  },
  async deleteCardio(session) {
    const { error } = await db().rpc('delete_cardio', {
      p_id: session.id,
      p_revision: session.revision,
    });
    check(error);
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
