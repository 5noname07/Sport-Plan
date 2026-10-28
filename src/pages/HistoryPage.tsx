import { useState } from 'react';
import type { DataSet, Macros } from '../domain/types';
import { sumNutrition, workoutTotals } from '../domain/calculations';
import { Card, Empty, format, NutritionProgress } from '../components/shared';
import { CardioSummary } from '../components/TrainingSummary';

export function HistoryPage({
  data,
  date,
  target,
  selectDate,
  navigate,
  openCardio,
}: {
  data: DataSet;
  date: string;
  target: Macros | null;
  selectDate: (date: string) => void;
  navigate: (page: 'workout' | 'diet') => void;
  openCardio: (id: string) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const dates = [
    ...new Set([
      ...data.workouts.map((w) => w.date),
      ...data.days.map((d) => d.date),
      ...data.cardio.map((s) => s.date),
    ]),
  ]
    .sort((a, b) => b.localeCompare(a))
    .filter((d) => (!start || d >= start) && (!end || d <= end));
  const workout = data.workouts.find((w) => w.date === date);
  const cardio = data.cardio.filter((s) => s.date === date);
  const day = data.days.find((d) => d.date === date);
  const entries = data.entries.filter((e) => e.day_id === day?.id);
  return (
    <div className="history-grid">
      <Card title="历史日期">
        <div className="form-grid">
          <label>
            起始日期
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            结束日期
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {!dates.length && <Empty>此范围暂无记录。</Empty>}
        <div className="date-list">
          {dates.map((d) => {
            const w = data.workouts.find((w) => w.date === d);
            const md = data.days.find((day) => day.date === d);
            const meals = data.entries.filter((e) => e.day_id === md?.id);
            return (
              <button
                className={`date-button ${date === d ? 'selected' : ''}`}
                key={d}
                onClick={() => selectDate(d)}
              >
                <strong>{d}</strong>
                <small>
                  {w
                    ? `${workoutTotals(w.exercises.flatMap((e) => e.sets)).sets} 组训练`
                    : '无训练'}{' '}
                  · 有氧 {data.cardio.filter((s) => s.date === d).length} 次 ·{' '}
                  {format(sumNutrition(meals).calories, 0)} kcal
                </small>
              </button>
            );
          })}
        </div>
      </Card>
      <div className="stack">
        <Card title={`${date} · 营养完成情况`}>
          <NutritionProgress actual={sumNutrition(entries)} target={target} />
        </Card>
        <Card title="训练详情">
          {!workout && <Empty>这一天没有训练记录。</Empty>}
          {workout?.exercises.map((e) => (
            <div className="history-exercise" key={e.exercise_id}>
              <h3>{data.exercises.find((ex) => ex.id === e.exercise_id)?.name}</h3>
              {e.sets.map((s, i) => (
                <p key={i}>
                  第 {i + 1} 组：{format(s.weight_kg)} kg × {s.reps}
                </p>
              ))}
            </div>
          ))}
          {workout?.notes && <p className="preserve-lines">备注：{workout.notes}</p>}
          <button className="secondary" onClick={() => navigate('workout')}>
            记录 / 修改训练
          </button>
        </Card>
        <Card title="有氧训练详情">
          {!cardio.length && <Empty>这一天没有有氧训练。</Empty>}
          {cardio.map((s) => (
            <article className="record" key={s.id}>
              <div>
                <CardioSummary session={s} />
                {s.notes && <p className="preserve-lines">备注：{s.notes}</p>}
              </div>
              <button className="text-button" onClick={() => openCardio(s.id)}>
                打开这条有氧
              </button>
            </article>
          ))}
        </Card>
        <Card title="饮食详情">
          {!entries.length && <Empty>这一天没有饮食记录。</Empty>}
          {entries.map((e) => (
            <div className="record" key={e.id}>
              <div>
                <strong>{e.food_name}</strong>
                <p>
                  {format(e.grams)} g · {format(e.calories)} kcal
                </p>
                <small>
                  蛋白质 {format(e.protein)} g · 碳水 {format(e.carbs)} g · 脂肪 {format(e.fat)} g
                </small>
              </div>
            </div>
          ))}
          <button className="secondary" onClick={() => navigate('diet')}>
            记录 / 修改饮食
          </button>
        </Card>
      </div>
    </div>
  );
}
