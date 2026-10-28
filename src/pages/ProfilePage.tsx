import { useState } from 'react';
import type { DataSet, Profile } from '../domain/types';
import type { Repository } from '../data/repository';
import { DEFAULT_PROFILE, localDate } from '../domain/calculations';
import { Card, Empty, format, NumberField, type RunAction } from '../components/shared';

export function ProfilePage({
  data,
  repository,
  run,
  busy,
}: {
  data: DataSet;
  repository: Repository;
  run: RunAction;
  busy: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(data.profile ?? DEFAULT_PROFILE);
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(localDate());
  const [bodyId, setBodyId] = useState<string>();
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [exerciseId, setExerciseId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const body = [...data.body].sort((a, b) => b.date.localeCompare(a.date));
  async function exportData() {
    setExporting(true);
    try {
      const fresh = await repository.load();
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { version: 1, exported_at: new Date().toISOString(), data: fresh },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sport-plan-${localDate()}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="stack">
      <Card title="个人身体信息">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => repository.saveProfile(profile), '个人信息已保存');
          }}
        >
          <div className="form-grid">
            <NumberField
              label="身高（cm）"
              value={profile.height_cm}
              min={100}
              max={250}
              onChange={(v) => setProfile({ ...profile, height_cm: Number(v) })}
            />
            <NumberField
              label="年龄（岁）"
              value={profile.age}
              min={18}
              max={100}
              step={1}
              onChange={(v) => setProfile({ ...profile, age: Number(v) })}
            />
            <label>
              公式使用的性别
              <select
                value={profile.sex}
                onChange={(e) => setProfile({ ...profile, sex: e.target.value as Profile['sex'] })}
              >
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </label>
            <label>
              日常活动（不含专门训练）
              <select
                value={profile.activity_factor}
                onChange={(e) =>
                  setProfile({ ...profile, activity_factor: Number(e.target.value) })
                }
              >
                <option value={1.2}>久坐为主 · 1.2</option>
                <option value={1.4}>日常走动较多 · 1.4</option>
                <option value={1.6}>体力工作较多 · 1.6</option>
              </select>
            </label>
            <NumberField
              label="蛋白质（g / kg 体重）"
              value={profile.protein_per_kg}
              min={1.4}
              max={2}
              step={0.1}
              onChange={(v) => setProfile({ ...profile, protein_per_kg: Number(v) })}
            />
            <label>
              脂肪热量占比
              <select
                value={profile.fat_fraction}
                onChange={(e) => setProfile({ ...profile, fat_fraction: Number(e.target.value) })}
              >
                {[0.2, 0.25, 0.3, 0.35].map((v) => (
                  <option key={v} value={v}>
                    {v * 100}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy}>保存个人信息</button>
        </form>
        <p className="hint">
          第一版以维持体重为目标，仅用于成人日常记录。年龄需自行更新。历史建议使用当前个人参数与该日或此前最近一次体重重新估算。
        </p>
      </Card>
      <Card title="体重记录">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(() => repository.saveWeight(date, Number(weight), bodyId), '体重已保存')
            ) {
              setWeight('');
              setBodyId(undefined);
            }
          }}
        >
          <label>
            称重日期
            <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
          </label>
          <NumberField label="体重（kg）" min={20} max={400} value={weight} onChange={setWeight} />
          <button disabled={busy}>{bodyId ? '修改体重' : '保存体重'}</button>
          {bodyId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setBodyId(undefined);
                setWeight('');
              }}
            >
              取消
            </button>
          )}
        </form>
        <p className="hint">同一日期保留一条体重；再次保存该日期会更新数值。</p>
        {!body.length && <Empty>先录入体重，才能计算每日营养建议。</Empty>}
        <div className="record-list">
          {body.map((r) => (
            <div key={r.id} className="record">
              <span>
                {r.date} · <strong>{format(r.weight_kg)} kg</strong>
              </span>
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() => {
                    setBodyId(r.id);
                    setDate(r.date);
                    setWeight(String(r.weight_kg));
                  }}
                >
                  修改
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      window.confirm('删除这条体重记录？可能影响历史营养估算。') &&
                      (await run(() => repository.deleteWeight(r.id), '体重已删除'))
                    ) {
                      if (bodyId === r.id) {
                        setBodyId(undefined);
                        setWeight('');
                      }
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="健身动作管理">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(
                () =>
                  repository.saveExercise(
                    exerciseName,
                    exerciseId,
                    exerciseId ? exerciseNotes : exerciseNotes || undefined,
                  ),
                '动作已保存',
              )
            ) {
              setExerciseName('');
              setExerciseNotes('');
              setExerciseId(undefined);
            }
          }}
        >
          <label>
            动作名称
            <input
              value={exerciseName}
              required
              maxLength={80}
              placeholder="例如：卧推"
              onChange={(e) => setExerciseName(e.target.value)}
            />
          </label>
          <label>
            动作备注（长期共享）
            <textarea
              value={exerciseNotes}
              maxLength={4000}
              rows={3}
              placeholder="动作要领、发力技巧、注意事项…"
              onChange={(e) => setExerciseNotes(e.target.value)}
            />
          </label>
          <button disabled={busy || !exerciseName.trim()}>
            {exerciseId ? '保存动作名称' : '添加动作'}
          </button>
          {exerciseId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setExerciseId(undefined);
                setExerciseName('');
                setExerciseNotes('');
              }}
            >
              取消
            </button>
          )}
        </form>
        <div className="record-list">
          {data.exercises
            .filter((e) => !e.archived)
            .map((exercise) => (
              <div key={exercise.id} className="record">
                <div>
                  <strong>{exercise.name}</strong>
                  <p className="preserve-lines muted">
                    {exercise.notes || '尚无动作备注，可点击编辑添加。'}
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      setExerciseId(exercise.id);
                      setExerciseName(exercise.name);
                      setExerciseNotes(exercise.notes ?? '');
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`删除“${exercise.name}”？历史训练与趋势仍会保留。`))
                        void run(() => repository.archiveExercise(exercise.id), '动作已归档');
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
        </div>
      </Card>
      <Card title="估算方法与数据备份">
        <details>
          <summary>查看营养计算依据</summary>
          <div className="prose">
            <p>BMR = 10 × 体重 kg + 6.25 × 身高 cm − 5 × 年龄 + 性别常数（男 +5，女 −161）。</p>
            <p>
              建议热量 = BMR × 日常活动系数 + 训练净消耗。力量训练按 3.5 MET 估算，净消耗 = (3.5 −
              1) × 3.5 × 体重 / 200 × 分钟。时长为 0 时不追加热量。
            </p>
            <p>
              蛋白质 = 体重 × 可调参数（默认 1.6 g/kg）；脂肪占热量默认
              30%；剩余热量分给碳水。蛋白质和碳水按 4 kcal/g，脂肪按 9 kcal/g。
            </p>
            <p>
              活动系数是实用近似值，训练容量不能直接换算热量。动作节奏、休息、个人差异都会影响实际消耗。
            </p>
            <p>
              有氧训练按记录类型和已录入时长估算净 MET
              消耗，逐项累加；缺少时长或“其他有氧”不追加。跑步按一般慢跑 7.5 MET，骑行按休闲 4
              MET，游泳按慢速休闲自由泳 5.8 MET，椭圆机中等强度 5 MET，专门步行 3.5
              MET。距离与心率不用于推测强度。已包含在日常活动中的运动请取消“计入营养调整”，力量时长也只填写力量部分。
            </p>
            <p>
              <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noreferrer">
                Mifflin–St Jeor 原始研究
              </a>{' '}
              ·{' '}
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/"
                target="_blank"
                rel="noreferrer"
              >
                ISSN 蛋白质声明
              </a>{' '}
              ·{' '}
              <a
                href="https://pacompendium.com/conditioning-exercise/"
                target="_blank"
                rel="noreferrer"
              >
                2024 运动 MET 表
              </a>
            </p>
          </div>
        </details>
        <p className="muted">
          定期导出完整记录作为个人备份。文件包含身体信息和饮食记录，请自行妥善保管。
        </p>
        <button
          className="secondary"
          disabled={exporting}
          onClick={() => {
            void run(exportData, '备份已下载');
          }}
        >
          导出 JSON 备份
        </button>
        <p className="hint">当前提供导出；批量恢复请使用数据库备份，界面暂未提供导入。</p>
      </Card>
    </div>
  );
}
