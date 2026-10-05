import type { ReactNode } from 'react';
import type { Macros } from '../domain/types';
export const format = (n: number, digits = 1) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(n);
export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}
export function NumberField({ label, value, onChange, min = 0, max, step = 'any', required = true }: {
  label: string; value: number | string; onChange: (value: string) => void; min?: number; max?: number; step?: number | string; required?: boolean;
}) {
  return <label>{label}<input type="number" inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step}
    value={value} required={required} onChange={e => onChange(e.target.value)} /></label>;
}
export function NutritionProgress({ actual, target }: { actual: Macros; target?: Macros | null }) {
  const labels: [keyof Macros, string, string][] = [['calories','热量','kcal'],['protein','蛋白质','g'],['carbs','碳水','g'],['fat','脂肪','g']];
  return <div className="nutrition-grid">{labels.map(([key,label,unit]) => {
    const goal = target?.[key];
    const percentage = goal && goal > 0 ? actual[key]/goal*100 : 0;
    return <div className="nutrient" key={key}><div className="row"><strong>{label}</strong><span>{unit}</span></div>
      <p><b>{format(actual[key])}</b><span className="muted"> / {goal === undefined ? '—' : format(goal)}</span></p>
      <progress aria-label={`${label}完成情况`} max={100} value={Math.min(percentage,100)} />
      <small>{goal === undefined ? '设置身体信息后显示建议' : actual[key] > goal ? `超出 ${format(actual[key]-goal)} ${unit}` : `还差 ${format(goal-actual[key])} ${unit}`}</small>
    </div>;
  })}</div>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }
export type RunAction = (action: () => Promise<void>, success?: string) => Promise<boolean>;
