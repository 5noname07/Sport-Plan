export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface Profile {
  user_id?: string;
  height_cm: number;
  age: number;
  sex: 'male' | 'female';
  activity_factor: number;
  protein_per_kg: number;
  fat_fraction: number;
}
export interface BodyRecord {
  id: string;
  date: string;
  weight_kg: number;
}
export interface Exercise {
  id: string;
  name: string;
  archived: boolean;
}
export interface TrainingSet {
  weight_kg: number;
  reps: number;
}
export interface WorkoutExercise {
  exercise_id: string;
  sets: TrainingSet[];
}
export interface Workout {
  id: string;
  date: string;
  duration_minutes: number;
  notes: string;
  revision: number;
  exercises: WorkoutExercise[];
}
export interface Food extends Macros {
  id: string;
  name: string;
  base_grams: number;
  archived: boolean;
}
export interface MealEntry extends Macros {
  id: string;
  day_id: string;
  food_id: string | null;
  food_name: string;
  grams: number;
  created_at: string;
}
export interface MealDay {
  id: string;
  date: string;
}
export interface DataSet {
  profile: Profile | null;
  body: BodyRecord[];
  exercises: Exercise[];
  workouts: Workout[];
  foods: Food[];
  days: MealDay[];
  entries: MealEntry[];
}
export const EMPTY_DATA: DataSet = {
  profile: null,
  body: [],
  exercises: [],
  workouts: [],
  foods: [],
  days: [],
  entries: [],
};
