import { useEffect, useState } from 'react';
import type { DataSet, Workout } from '../domain/types';
import type { Repository } from '../data/repository';
import { workoutTotals } from '../domain/calculations';
import { Card, Empty, format, type RunAction } from '../components/shared';

// Keep text while editing so a phone user can clear an input or enter a decimal naturally.
type DraftExercise = {
  exercise_id: string;
  sets: { weight_kg: number | string; reps: number | string }[];
};
type DraftWorkout = Omit<Workout, 'exercises' | 'duration_minutes'> & {
  exercises: DraftExercise[];
  duration_minutes: number | string;
};
function toWorkout(draft: DraftWorkout): Workout {
  return {
    ...draft,
    duration_minutes: Number(draft.duration_minutes),
    exercises: draft.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        weight_kg: Number(set.weight_kg),
        reps: Number(set.reps),
      })),
    })),
  };
}

export function WorkoutPage({
  data,
  date,
  repository,
  run,
  busy,
  onDirty,
}: {
  data: DataSet;
  date: string;
  repository: Repository;
  run: RunAction;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const existing = data.workouts.find((w) => w.date === date);
  const [draft, setDraft] = useState<DraftWorkout>(() =>
    structuredClone(
      existing ?? { id: '', date, duration_minutes: 0, notes: '', revision: 0, exercises: [] },
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  useEffect(() => {
    if (!dirty)
      setDraft(
        structuredClone(
          existing ?? { id: '', date, duration_minutes: 0, notes: '', revision: 0, exercises: [] },
        ),
      );
  }, [existing, date, dirty]);
  function change(next: DraftWorkout) {
    setDraft(next);
    setDirty(true);
    onDirty(true);
  }
  const totals = workoutTotals(toWorkout(draft).exercises.flatMap((e) => e.sets));
  function updateExercise(index: number, next: DraftExercise) {
    change({ ...draft, exercises: draft.exercises.map((e, i) => (i === index ? next : e)) });
  }
  const available = data.exercises.filter(
    (e) => !e.archived && !draft.exercises.some((d) => d.exercise_id === e.id),
  );
  const conflict = (existing?.revision ?? 0) !== draft.revision && dirty;
  return (
    <div className="stack">
      <Card title="记录训练">
        <div className="row wrap">
          <p className="muted">每一组独立记录 · 自重动作可填 0 kg</p>
          <span className="badge">
            {totals.sets} 组 · {format(totals.volume)} kg 容量
          </span>
        </div>
        {conflict && (
          <div className="notice error">
            云端记录已经改变。请先复制需要保留的输入，再点击下方“重新读取云端记录”。
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => repository.saveWorkout(toWorkout(draft)), '训练已保存')) {
              setDirty(false);
              onDirty(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              训练时长（分钟）
              <input
                type="number"
                min="0"
                max="600"
                step="1"
                required
                value={draft.duration_minutes}
                onChange={(e) => change({ ...draft, duration_minutes: e.target.value })}
              />
            </label>
            <label>
              训练备注
              <input
                maxLength={2000}
                value={draft.notes}
                placeholder="状态、动作要点…"
                onChange={(e) => change({ ...draft, notes: e.target.value })}
              />
            </label>
          </div>
          <p className="hint">
            实际时长用于估算额外消耗；填 0 表示不追加训练热量。日常活动系数不含本次训练。
          </p>
          {draft.exercises.length === 0 && (
            <Empty>从下面选择一个动作，开始记录今天的第一组。</Empty>
          )}
          {draft.exercises.map((item, index) => {
            const exercise = data.exercises.find((e) => e.id === item.exercise_id);
            const previous = data.workouts
              .filter(
                (w) => w.date < date && w.exercises.some((e) => e.exercise_id === item.exercise_id),
              )
              .sort((a, b) => b.date.localeCompare(a.date))[0];
            const previousSets = previous?.exercises.find(
              (e) => e.exercise_id === item.exercise_id,
            )?.sets;
            return (
              <section className="exercise-block" key={item.exercise_id}>
                <div className="row">
                  <h3>
                    {exercise?.name ?? '未知动作'}
                    {exercise?.archived && <small>（已归档）</small>}
                  </h3>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() =>
                      change({ ...draft, exercises: draft.exercises.filter((_, i) => i !== index) })
                    }
                  >
                    移除动作
                  </button>
                </div>
                {previous && (
                  <div className="previous">
                    <span>
                      上次 {previous.date}：
                      {previousSets!.map((s) => `${s.weight_kg} kg × ${s.reps}`).join(' / ')}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (window.confirm('用上次训练的组替换当前动作的组？'))
                          updateExercise(index, { ...item, sets: structuredClone(previousSets!) });
                      }}
                    >
                      沿用上次
                    </button>
                  </div>
                )}
                <div className="set-header">
                  <span>组</span>
                  <span>重量 kg</span>
                  <span>次数</span>
                  <span />
                </div>
                {item.sets.map((set, si) => (
                  <div className="set-row" key={si}>
                    <span className="set-index">{si + 1}</span>
                    <input
                      aria-label={`${exercise?.name}第${si + 1}组重量`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="2000"
                      step="any"
                      required
                      value={set.weight_kg}
                      onChange={(e) =>
                        updateExercise(index, {
                          ...item,
                          sets: item.sets.map((s, j) =>
                            j === si ? { ...s, weight_kg: e.target.value } : s,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`${exercise?.name}第${si + 1}组次数`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="1000"
                      step="1"
                      required
                      value={set.reps}
                      onChange={(e) =>
                        updateExercise(index, {
                          ...item,
                          sets: item.sets.map((s, j) =>
                            j === si ? { ...s, reps: e.target.value } : s,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`删除${exercise?.name}第${si + 1}组`}
                      disabled={item.sets.length <= 1}
                      onClick={() =>
                        updateExercise(index, {
                          ...item,
                          sets: item.sets.filter((_, j) => j !== si),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={item.sets.length >= 200}
                  onClick={() =>
                    updateExercise(index, {
                      ...item,
                      sets: [...item.sets, { ...item.sets[item.sets.length - 1] }],
                    })
                  }
                >
                  ＋ 下一组（复制上一组）
                </button>
              </section>
            );
          })}
          <div className="actions">
            <button disabled={busy || draft.exercises.length === 0 || conflict} type="submit">
              {busy ? '保存中…' : '保存训练'}
            </button>
            {dirty && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (window.confirm('放弃当前未保存的修改并重新读取云端记录？')) {
                    setDirty(false);
                    onDirty(false);
                  }
                }}
              >
                重新读取云端记录
              </button>
            )}
            {existing && (
              <button
                type="button"
                className="secondary danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    window.confirm('删除这一天的全部训练记录？此操作无法撤销。') &&
                    (await run(() => repository.deleteWorkout(existing), '训练已删除'))
                  ) {
                    setDirty(false);
                    onDirty(false);
                  }
                }}
              >
                删除当天训练
              </button>
            )}
          </div>
        </form>
        <div className="add-exercise">
          <label>
            选择动作
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">请选择动作</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={!selected || draft.exercises.length >= 100}
            onClick={() => {
              change({
                ...draft,
                exercises: [
                  ...draft.exercises,
                  { exercise_id: selected, sets: [{ weight_kg: 0, reps: 10 }] },
                ],
              });
              setSelected('');
            }}
          >
            ＋ 添加动作
          </button>
        </div>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => repository.saveExercise(newName), '动作已新增')) setNewName('');
          }}
        >
          <label>
            新动作
            <input
              value={newName}
              required
              maxLength={80}
              placeholder="例如：哑铃划船"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy || !newName.trim()}>
            新增动作
          </button>
        </form>
      </Card>
    </div>
  );
}
