import { useEffect, useState } from 'react';
import type { Exercise } from '../domain/types';
import type { Repository } from '../data/repository';
import type { RunAction } from './shared';

// May be rendered inside the workout form: use a separate button, never a nested form.
export function ExerciseNotes({
  exercise,
  repository,
  run,
  busy,
}: {
  exercise: Exercise;
  repository: Repository;
  run: RunAction;
  busy: boolean;
}) {
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setNotes(exercise.notes ?? '');
  }, [exercise.notes, dirty]);
  return (
    <details className="exercise-notes">
      <summary>
        {exercise.name} · 动作备注{!exercise.notes ? '（尚未填写，可直接添加）' : ''}
      </summary>
      <p className="hint">与动作长期关联，所有训练日共享。独立保存，不会修改当天训练或整体备注。</p>
      <label>
        {exercise.name}的动作备注
        <textarea
          aria-label={`${exercise.name}的动作备注`}
          maxLength={4000}
          rows={4}
          value={notes}
          placeholder="动作要领、发力感受、注意事项…"
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !dirty}
        onClick={async () => {
          if (await run(() => repository.saveExerciseNotes(exercise.id, notes), '动作备注已保存'))
            setDirty(false);
        }}
      >
        保存动作备注
      </button>
    </details>
  );
}
