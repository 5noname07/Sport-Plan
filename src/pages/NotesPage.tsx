import { useState } from 'react';
import type { DataSet, SessionKind } from '../domain/types';
import type { Repository } from '../data/repository';
import { CARDIO_ACTIVITIES } from '../domain/cardio';
import { workoutTotals } from '../domain/calculations';
import { Card, Empty, type RunAction } from '../components/shared';

export function NotesPage({
  data,
  repository,
  run,
  busy,
  openTraining,
}: {
  data: DataSet;
  repository: Repository;
  run: RunAction;
  busy: boolean;
  openTraining: (kind: SessionKind, id: string, date: string) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editing, setEditing] = useState<{
    id: string;
    kind: SessionKind;
    notes: string;
    revision: number;
    date: string;
  } | null>(null);
  const notes = [
    ...data.workouts.map((w) => ({
      id: w.id,
      kind: 'strength' as const,
      date: w.date,
      time: '',
      notes: w.notes,
      revision: w.revision,
      summary: `力量训练 · ${w.exercises.map((e) => data.exercises.find((x) => x.id === e.exercise_id)?.name ?? '动作').join('、')} · ${workoutTotals(w.exercises.flatMap((e) => e.sets)).sets} 组`,
    })),
    ...data.cardio.map((s) => ({
      id: s.id,
      kind: 'cardio' as const,
      date: s.date,
      time: s.start_time ?? '',
      notes: s.notes,
      revision: s.revision,
      summary: `有氧 · ${CARDIO_ACTIVITIES[s.activity].label}${s.duration_minutes !== null ? ` · ${s.duration_minutes} 分钟` : ''}`,
    })),
  ]
    .filter((s) => s.notes.trim() && (!start || s.date >= start) && (!end || s.date <= end))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.id.localeCompare(b.id),
    );
  return (
    <div className="stack">
      <Card title="训练备注专区">
        <p className="muted">
          集中管理每次训练的整体感受。动作要领请在对应动作的“动作备注”中管理。
        </p>
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
        {start > end && end && <p className="notice error">起始日期不能晚于结束日期。</p>}
        {!notes.length && (
          <Empty>此范围暂无训练备注。保存力量训练或有氧记录时填写整体备注，即可在这里找到。</Empty>
        )}
        {editing && (
          <form
            className="note-editor"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  () =>
                    repository.saveTrainingNotes(
                      editing.kind,
                      editing.id,
                      editing.notes,
                      editing.revision,
                    ),
                  '训练备注已保存',
                )
              )
                setEditing(null);
            }}
          >
            <h3>
              编辑 {editing.date} · {editing.kind === 'strength' ? '力量训练' : '有氧训练'}
            </h3>
            <label>
              训练整体备注
              <textarea
                aria-label="训练整体备注"
                maxLength={2000}
                rows={6}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </label>
            <p className="hint">保存空内容将清空这次训练的备注，并从专区隐藏；训练本身仍保留。</p>
            <div className="actions">
              <button disabled={busy}>保存训练备注</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                取消编辑
              </button>
            </div>
          </form>
        )}
        <div className="record-list">
          {notes.map((note) => (
            <details className="training-note" key={`${note.kind}:${note.id}`}>
              <summary>
                {note.date}
                {note.time && ` ${note.time.slice(0, 5)}`} · {note.summary}
              </summary>
              <p className="preserve-lines">{note.notes}</p>
              <div className="actions">
                <button className="secondary" onClick={() => setEditing({ ...note })}>
                  编辑整体备注
                </button>
                <button
                  className="text-button"
                  onClick={() => openTraining(note.kind, note.id, note.date)}
                >
                  打开对应训练
                </button>
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
