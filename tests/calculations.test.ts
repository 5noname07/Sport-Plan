import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, exerciseTrend, localDate, nutritionTarget, scaleFood, sumNutrition, weightOnDate, workoutTotals } from '../src/domain/calculations';

describe('核心计算', () => {
  it('逐组累加不同重量、次数，支持自重 0 kg', () => {
    expect(workoutTotals([{ weight_kg:60,reps:12 },{ weight_kg:65,reps:10 },{ weight_kg:70,reps:8 },{ weight_kg:0,reps:5 }]))
      .toEqual({ sets:4,reps:35,volume:1930,maxWeight:70 });
    expect(workoutTotals([])).toEqual({ sets:0,reps:0,volume:0,maxWeight:0 });
  });
  it('食品按基准重量缩放，不提前四舍五入', () => {
    const f = { base_grams:100,calories:165,protein:31,carbs:0,fat:3.6 };
    expect(scaleFood(f,200)).toEqual({ calories:330,protein:62,carbs:0,fat:7.2 });
    expect(scaleFood(f,75).protein).toBe(23.25);
    expect(() => scaleFood(f,0)).toThrow();
  });
  it('每日营养汇总', () => {
    expect(sumNutrition([{ calories:330,protein:62,carbs:0,fat:7.2 },{ calories:200,protein:2,carbs:45,fat:1 }]))
      .toEqual({ calories:530,protein:64,carbs:45,fat:8.2 });
    expect(sumNutrition([]).calories).toBe(0);
  });
  it('男性和女性 BMR；训练只加入净运动消耗', () => {
    const profile = { ...DEFAULT_PROFILE, height_cm:175,age:30 };
    const rest = nutritionTarget(profile,70,0);
    expect(rest.bmr).toBe(1648.75);
    expect(rest.calories).toBeCloseTo(1978.5);
    expect(rest.protein).toBe(112);
    expect(nutritionTarget({ ...profile,sex:'female' },70,0).bmr).toBe(1482.75);
    const train = nutritionTarget(profile,70,60);
    expect(train.trainingCalories).toBeCloseTo(183.75);
    expect(train.calories).toBeCloseTo(2162.25);
    expect(train.protein*4+train.carbs*4+train.fat*9).toBeCloseTo(train.calories);
    expect(() => nutritionTarget(profile,0,60)).toThrow();
  });
  it('历史日不能使用未来体重', () => {
    const body = [{ id:'a',date:'2026-01-01',weight_kg:70 },{ id:'b',date:'2026-02-01',weight_kg:72 }];
    expect(weightOnDate(body,'2026-01-15')).toBe(70);
    expect(weightOnDate(body,'2025-12-01')).toBeUndefined();
  });
  it('趋势仅统计选定动作、日期，休息日不伪造零重量', () => {
    const workouts = [{ id:'a',date:'2026-01-02',revision:1,duration_minutes:0,notes:'',exercises:[{ exercise_id:'bench',sets:[{ weight_kg:60,reps:10 }] }] }];
    expect(exerciseTrend(workouts,'bench','2026-01-01','2026-01-31')[0].volume).toBe(600);
    expect(exerciseTrend(workouts,'squat','2026-01-01','2026-01-31')).toEqual([]);
    expect(exerciseTrend(workouts,'bench','2026-01-03','2026-01-31')).toEqual([]);
  });
  it('日期使用本地年月日', () => {
    expect(localDate(new Date(2026,0,2,0,15))).toBe('2026-01-02');
  });
});
