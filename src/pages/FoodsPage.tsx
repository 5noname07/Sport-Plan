import { useState } from 'react';
import type { DataSet, Food } from '../domain/types';
import type { Repository } from '../data/repository';
import { Card, Empty, format, NumberField, type RunAction } from '../components/shared';

const EMPTY_FOOD = { name: '', base_grams: '100', calories: '', protein: '', carbs: '', fat: '' };
export function FoodsPage({
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
  const [draft, setDraft] = useState(EMPTY_FOOD);
  const [editing, setEditing] = useState<string>();
  const [search, setSearch] = useState('');
  function edit(food: Food) {
    setEditing(food.id);
    setDraft({
      name: food.name,
      base_grams: String(food.base_grams),
      calories: String(food.calories),
      protein: String(food.protein),
      carbs: String(food.carbs),
      fat: String(food.fat),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const foods = data.foods
    .filter((f) => !f.archived && f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return (
    <div className="stack">
      <Card title={editing ? '编辑食品' : '添加个人食品'}>
        <p className="muted">按包装标签或可信来源录入。生重与熟重请在名称中注明。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const food = {
              name: draft.name.trim(),
              base_grams: Number(draft.base_grams),
              calories: Number(draft.calories),
              protein: Number(draft.protein),
              carbs: Number(draft.carbs),
              fat: Number(draft.fat),
            };
            if (await run(() => repository.saveFood(food, editing), '食品已保存')) {
              setDraft(EMPTY_FOOD);
              setEditing(undefined);
            }
          }}
        >
          <div className="form-grid">
            <label>
              食品名称
              <input
                value={draft.name}
                required
                maxLength={80}
                placeholder="例如：鸡胸肉（熟）"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <NumberField
              label="基准重量（g）"
              value={draft.base_grams}
              min={0.1}
              max={10000}
              onChange={(v) => setDraft({ ...draft, base_grams: v })}
            />
            {(['calories', 'protein', 'carbs', 'fat'] as const).map((key, i) => (
              <NumberField
                key={key}
                label={['热量（kcal）', '蛋白质（g）', '碳水（g）', '脂肪（g）'][i]}
                value={draft[key]}
                max={key === 'calories' ? 100000 : 10000}
                onChange={(v) => setDraft({ ...draft, [key]: v })}
              />
            ))}
          </div>
          <div className="actions">
            <button disabled={busy || !draft.name.trim()}>
              {editing ? '保存食品修改' : '添加食品'}
            </button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(undefined);
                  setDraft(EMPTY_FOOD);
                }}
              >
                取消
              </button>
            )}
          </div>
        </form>
      </Card>
      <Card title="个人食品库">
        <label>
          搜索食品库
          <input
            value={search}
            placeholder="按名称搜索"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {!foods.length && <Empty>没有找到食品。添加后，每次只需要输入食用重量。</Empty>}
        <div className="record-list">
          {foods.map((food) => (
            <article className="record" key={food.id}>
              <div>
                <h3>{food.name}</h3>
                <p>
                  每 {format(food.base_grams)} g · {format(food.calories)} kcal
                </p>
                <small className="muted">
                  蛋白质 {format(food.protein)} g · 碳水 {format(food.carbs)} g · 脂肪{' '}
                  {format(food.fat)} g
                </small>
              </div>
              <div className="actions">
                <button className="text-button" onClick={() => edit(food)}>
                  编辑
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      window.confirm(`从食品库删除“${food.name}”？历史饮食仍会保留。`) &&
                      (await run(() => repository.archiveFood(food.id), '食品已归档'))
                    ) {
                      if (editing === food.id) {
                        setEditing(undefined);
                        setDraft(EMPTY_FOOD);
                      }
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
