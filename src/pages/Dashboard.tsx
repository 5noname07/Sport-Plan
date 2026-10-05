import type { DataSet, Macros } from '../domain/types';
import { sumNutrition, workoutTotals } from '../domain/calculations';
import { Card, Empty, format, NutritionProgress } from '../components/shared';

export function Dashboard({
  data,
  date,
  target,
  navigate,
}: {
  data: DataSet;
  date: string;
  target: Macros | null;
  navigate: (page: 'workout' | 'diet' | 'profile') => void;
}) {
  const workout = data.workouts.find((w) => w.date === date);
  const totals = workoutTotals(workout?.exercises.flatMap((e) => e.sets) ?? []);
  const day = data.days.find((d) => d.date === date);
  const actual = sumNutrition(data.entries.filter((e) => e.day_id === day?.id));
  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">DAY BY DAY</p>
          <h1>
            让每一次努力，
            <br />
            都有迹可循。
          </h1>
          <p>记录训练，吃好每一餐。看见长期积累的变化。</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => navigate('workout')}>＋ 记录训练</button>
          <button className="secondary" onClick={() => navigate('diet')}>
            ＋ 记录饮食
          </button>
        </div>
      </section>
      <div className="stats-grid">
        <div className="stat">
          <small>训练状态</small>
          <strong>{workout ? '已记录' : '待训练'}</strong>
          <span>{workout ? `${workout.exercises.length} 个动作` : '休息也是计划的一部分'}</span>
        </div>
        <div className="stat">
          <small>训练组数</small>
          <strong>
            {totals.sets}
            <em> 组</em>
          </strong>
          <span>共 {totals.reps} 次</span>
        </div>
        <div className="stat">
          <small>训练容量</small>
          <strong>
            {format(totals.volume, 0)}
            <em> kg</em>
          </strong>
          <span>逐组重量 × 次数之和</span>
        </div>
        <div className="stat">
          <small>建议热量</small>
          <strong>
            {target ? format(target.calories, 0) : '—'}
            <em> kcal</em>
          </strong>
          <span>维持体重的每日估算</span>
        </div>
      </div>
      <Card title="当天营养进度">
        {!target && (
          <div className="notice">
            还缺少身体信息或该日期之前的体重记录。
            <button className="text-button" onClick={() => navigate('profile')}>
              前往设置
            </button>
          </div>
        )}
        <NutritionProgress actual={actual} target={target} />
      </Card>
      <Card title="当天训练">
        {!workout ? (
          <Empty>还没有训练记录。点击“记录训练”开始；也可以记录过去的日期。</Empty>
        ) : (
          <div className="record-list">
            {workout.exercises.map((e) => {
              const summary = workoutTotals(e.sets);
              return (
                <article className="record" key={e.exercise_id}>
                  <div>
                    <h3>{data.exercises.find((x) => x.id === e.exercise_id)?.name}</h3>
                    <p className="muted">
                      {e.sets.map((s) => `${s.weight_kg} kg × ${s.reps}`).join(' / ')}
                    </p>
                  </div>
                  <span className="badge">
                    {summary.sets} 组 · {summary.reps} 次
                  </span>
                </article>
              );
            })}
          </div>
        )}
        <button className="secondary" onClick={() => navigate('workout')}>
          {workout ? '查看 / 修改训练' : '记录第一组'}
        </button>
      </Card>
    </div>
  );
}
