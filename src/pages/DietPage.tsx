import { useState } from 'react';
import type { DataSet, Macros, MealEntry } from '../domain/types';
import type { Repository } from '../data/repository';
import { scaleFood, sumNutrition } from '../domain/calculations';
import { Card, Empty, format, NutritionProgress, type RunAction } from '../components/shared';

export function DietPage({ data, date, target, repository, run, busy }: {
  data: DataSet; date: string; target: Macros | null; repository: Repository; run: RunAction; busy: boolean;
}) {
  const [search,setSearch] = useState(''); const [selected,setSelected] = useState('');
  const [grams,setGrams] = useState('100'); const [editing,setEditing] = useState<MealEntry | null>(null);
  const food = data.foods.find(f => f.id === selected);
  const day = data.days.find(d => d.date === date);
  const entries = data.entries.filter(e => e.day_id === day?.id).sort((a,b) => a.created_at.localeCompare(b.created_at));
  const filtered = data.foods.filter(f => !f.archived && f.name.toLowerCase().includes(search.toLowerCase()));
  const amount = Number(grams);
  const preview = amount > 0 ? editing ? {
    calories:editing.calories*amount/editing.grams,protein:editing.protein*amount/editing.grams,
    carbs:editing.carbs*amount/editing.grams,fat:editing.fat*amount/editing.grams,
  } : food ? scaleFood(food,amount) : null : null;
  return <div className="stack"><Card title="当天营养"><NutritionProgress actual={sumNutrition(entries)} target={target} /></Card>
    <Card title={editing ? `修改 ${editing.food_name}` : '记录饮食'}>
      <form onSubmit={async e => {
        e.preventDefault(); if (await run(() => repository.saveMeal(date,editing?.food_id ?? selected,amount,editing?.id),'饮食已保存')) { setEditing(null); setGrams('100'); }
      }}>
        {!editing && <div className="form-grid"><label>搜索食品<input value={search} placeholder="输入食品名称" onChange={e => setSearch(e.target.value)} /></label>
          <label>选择食品<select value={selected} required onChange={e => setSelected(e.target.value)}><option value="">请选择食品</option>
            {food && !filtered.some(f => f.id === food.id) && <option value={food.id}>{food.name}</option>}
            {filtered.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>}
        {data.foods.filter(f => !f.archived).length === 0 && <Empty>还没有食品。请先在“食品库”添加食品及其营养信息。</Empty>}
        <label>实际食用重量（g）<input type="number" inputMode="decimal" min="0.1" max="10000" step="any" required value={grams} onChange={e => setGrams(e.target.value)} /></label>
        {preview && <p className="preview-values">{format(preview.calories)} kcal · 蛋白质 {format(preview.protein)} g · 碳水 {format(preview.carbs)} g · 脂肪 {format(preview.fat)} g</p>}
        {editing && <p className="hint">保留这条记录最初录入的营养比例，食品库更新不会改变历史记录。</p>}
        <div className="actions"><button disabled={busy || !preview}>{editing ? '保存修改' : '保存饮食'}</button>
          {editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setGrams('100'); }}>取消修改</button>}</div>
      </form>
    </Card><Card title="已记录的饮食">
      {!entries.length && <Empty>今天还没有饮食记录。</Empty>}
      <div className="record-list">{entries.map(entry => <article key={entry.id} className="record"><div><h3>{entry.food_name} <small>{format(entry.grams)} g</small></h3>
        <p>{format(entry.calories)} kcal</p><small className="muted">蛋白质 {format(entry.protein)} g · 碳水 {format(entry.carbs)} g · 脂肪 {format(entry.fat)} g</small></div>
        <div className="actions"><button className="text-button" disabled={busy} onClick={() => { setEditing(entry); setGrams(String(entry.grams)); }}>修改</button>
          <button className="text-button danger" disabled={busy} onClick={() => { if (window.confirm(`删除这条 ${entry.food_name} 饮食记录？`)) void run(() => repository.deleteMeal(entry.id),'饮食已删除').then(ok => { if(ok && editing?.id === entry.id) setEditing(null); }); }}>删除</button></div></article>)}</div>
    </Card></div>;
}
