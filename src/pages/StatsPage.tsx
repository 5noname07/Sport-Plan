import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DataSet } from '../domain/types';
import { exerciseTrend, localDate } from '../domain/calculations';
import { Card, Empty, format } from '../components/shared';

const METRICS = [
  { key: 'maxWeight', label: '最大训练重量', unit: 'kg' },
  { key: 'sets', label: '总组数', unit: '组' },
  { key: 'reps', label: '总次数', unit: '次' },
  { key: 'volume', label: '训练容量', unit: 'kg' },
] as const;
function TrendChart({
  rows,
  metric,
  unit,
  label,
}: {
  rows: Record<string, unknown>[];
  metric: string;
  unit: string;
  label: string;
}) {
  if (!rows.length) return <Empty>此范围暂无数据。记录后即可查看趋势。</Empty>;
  return (
    <>
      <div className="chart" role="img" aria-label={`${label}折线图`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 20, bottom: 8, left: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} minTickGap={30} />
            <YAxis
              width={60}
              domain={['auto', 'auto']}
              tickFormatter={(v) => format(Number(v), 0)}
            />
            <Tooltip formatter={(value) => [`${format(Number(value))} ${unit}`, label]} />
            <Line
              type="linear"
              dataKey={metric}
              stroke="#258c70"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>查看数据列表</summary>
        <div className="record-list">
          {rows.map((row) => (
            <div key={String(row.date)} className="record">
              <span>{String(row.date)}</span>
              <strong>
                {format(Number(row[metric]))} {unit}
              </strong>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
export function StatsPage({ data }: { data: DataSet }) {
  const [exercise, setExercise] = useState(data.exercises[0]?.id ?? '');
  const initial = new Date();
  initial.setDate(initial.getDate() - 90);
  const [start, setStart] = useState(localDate(initial));
  const [end, setEnd] = useState(localDate());
  const [metric, setMetric] = useState('maxWeight');
  const meta = METRICS.find((m) => m.key === metric)!;
  const rows = exerciseTrend(data.workouts, exercise, start, end);
  const body = data.body
    .filter((r) => r.date >= start && r.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      <Card title="长期训练趋势">
        <div className="form-grid">
          <label>
            选择动作
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
              <option value="">请选择动作</option>
              {data.exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.archived ? '（已归档）' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            趋势指标
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => (
                <option value={m.key} key={m.key}>
                  {m.label}（{m.unit}）
                </option>
              ))}
            </select>
          </label>
          <label>
            起始日期
            <input
              type="date"
              value={start}
              required
              max={end}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={end}
              required
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {start > end ? (
          <div className="notice error">起始日期不能晚于结束日期。</div>
        ) : (
          <TrendChart rows={rows} metric={metric} unit={meta.unit} label={meta.label} />
        )}
        <p className="hint">
          每个点代表一次训练日。最大重量为当日该动作所有组中的最高重量；容量逐组累加。自重动作的 0
          kg 不代表无训练，建议结合次数观察。
        </p>
      </Card>
      <Card title="体重变化">
        <TrendChart
          rows={body.map((r) => ({ date: r.date, weight_kg: r.weight_kg }))}
          metric="weight_kg"
          unit="kg"
          label="体重"
        />
      </Card>
    </div>
  );
}
