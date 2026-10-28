import { useState } from 'react';
import type { CardioActivity, CardioSession, DataSet } from '../domain/types';
import type { Repository } from '../data/repository';
import { CARDIO_ACTIVITIES, cardioTotals, cardioEnergy } from '../domain/cardio';
import { localDate, weightOnDate } from '../domain/calculations';
import { Card, Empty, format, NumberField, type RunAction } from '../components/shared';
import { CardioSummary } from '../components/TrainingSummary';
import { createRecordId } from '../domain/id';

function newSession(date: string): CardioSession {
  return {
    id: createRecordId(),
    date,
    start_time: null,
    activity: 'running',
    duration_minutes: null,
    distance_km: null,
    average_heart_rate: null,
    notes: '',
    include_in_nutrition: true,
    revision: 0,
  };
}
export function CardioPage({
  data,
  date,
  repository,
  run,
  busy,
  initialId,
}: {
  data: DataSet;
  date: string;
  repository: Repository;
  run: RunAction;
  busy: boolean;
  initialId?: string;
}) {
  const [draft, setDraft] = useState<CardioSession>(() =>
    structuredClone(data.cardio.find((s) => s.id === initialId) ?? newSession(date)),
  );
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(localDate());
  const [activity, setActivity] = useState('');
  const meta = CARDIO_ACTIVITIES[draft.activity];
  const sessions = data.cardio
    .filter(
      (s) =>
        (!start || s.date >= start) &&
        (!end || s.date <= end) &&
        (!activity || s.activity === activity),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.start_time ?? '').localeCompare(a.start_time ?? '') ||
        a.id.localeCompare(b.id),
    );
  const today = data.cardio.filter((s) => s.date === date);
  const totals = cardioTotals(sessions);
  const weight = weightOnDate(data.body, draft.date);
  const energy = weight ? cardioEnergy(draft, weight) : null;
  const conflict =
    draft.revision > 0 && data.cardio.find((s) => s.id === draft.id)?.revision !== draft.revision;
  function edit(session: CardioSession) {
    setDraft(structuredClone(session));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(session: CardioSession) {
    if (
      window.confirm('删除这条有氧训练？此操作无法撤销。') &&
      (await run(() => repository.deleteCardio(session), '有氧训练已删除'))
    ) {
      if (session.id === draft.id) setDraft(newSession(date));
    }
  }
  return (
    <div className="stack">
      <Card title={draft.revision ? '编辑有氧训练' : '记录有氧训练'}>
        <p className="muted">每项活动单独保存。同一天可记录多次，不需要先创建力量训练。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => repository.saveCardio(draft), '有氧训练已保存'))
              setDraft(newSession(date));
          }}
        >
          <div className="form-grid">
            <label>
              有氧日期
              <input
                type="date"
                value={draft.date}
                required
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              开始时间（可选）
              <input
                type="time"
                value={draft.start_time?.slice(0, 5) ?? ''}
                onChange={(e) => setDraft({ ...draft, start_time: e.target.value || null })}
              />
            </label>
            <label>
              有氧类型
              <select
                value={draft.activity}
                onChange={(e) => {
                  const activity = e.target.value as CardioActivity;
                  setDraft({
                    ...draft,
                    activity,
                    distance_km: CARDIO_ACTIVITIES[activity].distance ? draft.distance_km : null,
                  });
                }}
              >
                {Object.entries(CARDIO_ACTIVITIES).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="运动时长（分钟，可选）"
              value={draft.duration_minutes ?? ''}
              min={0.1}
              max={1440}
              required={false}
              onChange={(v) =>
                setDraft({ ...draft, duration_minutes: v === '' ? null : Number(v) })
              }
            />
            {meta.distance && (
              <NumberField
                label="距离（km，可选）"
                value={draft.distance_km ?? ''}
                min={0.001}
                max={2000}
                required={false}
                onChange={(v) => setDraft({ ...draft, distance_km: v === '' ? null : Number(v) })}
              />
            )}
            <NumberField
              label="平均心率（bpm，可选）"
              value={draft.average_heart_rate ?? ''}
              min={20}
              max={250}
              step={1}
              required={false}
              onChange={(v) =>
                setDraft({ ...draft, average_heart_rate: v === '' ? null : Number(v) })
              }
            />
          </div>
          <CardioSummary session={draft} />
          <label>
            有氧运动备注
            <textarea
              aria-label="有氧运动备注"
              maxLength={2000}
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.include_in_nutrition}
              onChange={(e) => setDraft({ ...draft, include_in_nutrition: e.target.checked })}
            />
            计入营养调整（专门训练，未计入日常活动系数）
          </label>
          <p className="hint">
            估算假设：{meta.assumption}
            {meta.met !== null ? `，${meta.met} MET（活动代码 ${meta.code}）` : ''}。
            {energy === null
              ? '不追加热量：未勾选、缺少时长/体重，或运动类型没有适用参数。'
              : `预计净消耗 ${format(energy)} kcal，已扣除静息部分。`}{' '}
            距离与心率只作记录，不推算未知强度。
          </p>
          {conflict && (
            <p className="notice error">
              这条记录已改变或被删除。请保留需要的输入，再从列表重新打开；当前内容不会覆盖云端。
            </p>
          )}
          <div className="actions">
            <button disabled={busy || conflict}>
              {draft.revision ? '保存有氧修改' : '保存有氧训练'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (window.confirm('放弃当前表单，开始一条新的有氧记录？'))
                  setDraft(newSession(date));
              }}
            >
              重置 / 新建
            </button>
          </div>
        </form>
      </Card>
      <Card title={`${date} · 当天有氧`}>
        {!today.length && <Empty>当天没有有氧训练。</Empty>}
        {today.map((s) => (
          <article className="record" key={s.id}>
            <div>
              <CardioSummary session={s} />
              {s.notes && <p className="preserve-lines">{s.notes}</p>}
            </div>
            <div className="actions">
              <button className="text-button" onClick={() => edit(s)}>
                编辑有氧
              </button>
              <button className="text-button danger" disabled={busy} onClick={() => void remove(s)}>
                删除有氧
              </button>
            </div>
          </article>
        ))}
      </Card>
      <Card title="有氧历史与统计">
        <div className="form-grid">
          <label>
            有氧起始日期
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            有氧结束日期
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            筛选运动类型
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              <option value="">全部类型</option>
              {Object.entries(CARDIO_ACTIVITIES).map(([key, m]) => (
                <option key={key} value={key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {start > end && end && <p className="notice error">起始日期不能晚于结束日期。</p>}
        <p className="preview-values">
          {totals.count} 次 · 已记录时长 {format(totals.minutes)} 分钟 · 已记录距离{' '}
          {format(totals.distanceKm, 2)} km
        </p>
        <p className="hint">
          {totals.timed} 项有时长，{totals.measured} 项有距离；缺失值不视为已完成 0 分钟/0
          km。不同运动距离的合计仅作汇总，可按运动类型筛选比较。
        </p>
        {!sessions.length && <Empty>此范围没有有氧训练记录。</Empty>}
        {sessions.map((s) => (
          <article className="record" key={s.id}>
            <div>
              <h3>{s.date}</h3>
              <CardioSummary session={s} />
              {s.notes && <p className="preserve-lines">{s.notes}</p>}
            </div>
            <div className="actions">
              <button className="text-button" onClick={() => edit(s)}>
                编辑记录
              </button>
              <button className="text-button danger" disabled={busy} onClick={() => void remove(s)}>
                删除记录
              </button>
            </div>
          </article>
        ))}
      </Card>
    </div>
  );
}
