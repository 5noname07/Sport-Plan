import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real PostgreSQL engine in WASM: run the exact production migration, transactions and RLS.
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
let exercise: string;
let food: string;
let workout: string;
let meal: string;
beforeAll(async () => {
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${owner}'),('${stranger}');`);
  await db.exec(
    readFileSync(new URL('../supabase/migrations/001_initial.sql', import.meta.url), 'utf8'),
  );
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
  exercise = (
    await db.query<{ id: string }>("insert into exercises(name) values('卧推') returning id")
  ).rows[0].id;
  food = (
    await db.query<{ id: string }>(
      "insert into foods(name,base_grams,calories,protein,carbs,fat) values('鸡胸肉',100,165,31,0,3.6) returning id",
    )
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await db.close();
});
const saveWorkout = (revision: number, reps = 10) =>
  db.query<{ id: string }>('select save_workout($1,$2,$3,$4::jsonb,$5) as id', [
    '2026-10-05',
    60,
    '测试',
    JSON.stringify([
      {
        exercise_id: exercise,
        sets: [
          { weight_kg: 60, reps },
          { weight_kg: 65, reps: 8 },
        ],
      },
    ]),
    revision,
  ]);

describe.sequential('数据库关键流程及数据隔离', () => {
  it('训练新增保存独立组、修改整体替换且递增版本', async () => {
    workout = (await saveWorkout(0)).rows[0].id;
    expect((await db.query('select * from training_sets')).rows).toHaveLength(2);
    await saveWorkout(1, 12);
    expect(
      (await db.query<{ revision: number }>('select revision from workouts')).rows[0].revision,
    ).toBe(2);
    expect(
      (await db.query<{ reps: number }>('select reps from training_sets order by position')).rows[0]
        .reps,
    ).toBe(12);
  });
  it('一致性快照包含关联组，超过默认 API 行数的数据也保留', async () => {
    await db.exec(
      "insert into body_records(date,weight_kg) select '2020-01-01'::date+i,70 from generate_series(0,1005) i",
    );
    const result = (
      await db.query<{
        records: { body: unknown[]; workouts: unknown[]; links: unknown[]; sets: unknown[] };
      }>('select get_records() as records')
    ).rows[0].records;
    expect(result.body).toHaveLength(1006);
    expect(result.workouts).toHaveLength(1);
    expect(result.links).toHaveLength(1);
    expect(result.sets).toHaveLength(2);
    await db.exec('delete from body_records');
  });
  it('过期版本拒绝覆盖，非法组回滚整个训练', async () => {
    await expect(saveWorkout(1)).rejects.toThrow('其他设备');
    await expect(saveWorkout(2, 0)).rejects.toThrow();
    expect(
      (await db.query<{ revision: number }>('select revision from workouts')).rows[0].revision,
    ).toBe(2);
    expect((await db.query('select * from training_sets')).rows).toHaveLength(2);
    await expect(
      db.query('select save_workout($1,$2,$3,$4,$5)', ['2026-10-05', 60, '', null, 2]),
    ).rejects.toThrow('数组');
    await expect(
      db.query('select save_workout($1,$2,$3,$4::jsonb,$5)', [
        '2026-10-05',
        60,
        '',
        JSON.stringify([{ exercise_id: exercise }]),
        2,
      ]),
    ).rejects.toThrow('数组');
    expect((await db.query('select * from training_sets')).rows).toHaveLength(2);
  });
  it('饮食按比例保存营养快照，食品编辑和归档不影响历史', async () => {
    meal = (
      await db.query<{ id: string }>('select save_meal_entry($1,$2,$3) as id', [
        '2026-10-05',
        food,
        200,
      ])
    ).rows[0].id;
    expect(
      Number(
        (await db.query<{ protein: string }>('select protein from meal_entries')).rows[0].protein,
      ),
    ).toBe(62);
    await db.query('update foods set protein=10,archived=true where id=$1', [food]);
    await db.query('select save_meal_entry($1,$2,$3,$4)', ['2026-10-05', food, 100, meal]);
    expect(
      Number(
        (await db.query<{ protein: string }>('select protein from meal_entries')).rows[0].protein,
      ),
    ).toBe(31);
    await expect(
      db.query('select save_meal_entry($1,$2,$3)', ['2026-10-05', food, 100]),
    ).rejects.toThrow('已删除');
  });
  it('另一个身份无法读取或引用原用户动作与饮食', async () => {
    await db.exec(`set request.jwt.claim.sub='${stranger}'`);
    expect((await db.query('select * from workouts')).rows).toHaveLength(0);
    expect((await db.query('select * from meal_entries')).rows).toHaveLength(0);
    const records = (
      await db.query<{ records: { workouts: unknown[]; entries: unknown[] } }>(
        'select get_records() as records',
      )
    ).rows[0].records;
    expect(records.workouts).toHaveLength(0);
    expect(records.entries).toHaveLength(0);
    await expect(saveWorkout(0)).rejects.toThrow();
    await expect(
      db.query('select save_meal_entry($1,$2,$3,$4)', ['2026-10-05', food, 300, meal]),
    ).rejects.toThrow('不存在');
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
  });
  it('删除训练级联清理组和动作关系；删除饮食、体重', async () => {
    await expect(db.query('select delete_workout($1,$2)', [workout, 1])).rejects.toThrow('改变');
    await db.query('select delete_workout($1,$2)', [workout, 2]);
    expect((await db.query('select * from training_sets')).rows).toHaveLength(0);
    expect((await db.query('select * from workout_exercises')).rows).toHaveLength(0);
    await db.query('delete from meal_entries where id=$1', [meal]);
    expect((await db.query('select * from meal_entries')).rows).toHaveLength(0);
    await db.exec(
      "insert into body_records(date,weight_kg) values('2026-10-05',70); update body_records set weight_kg=71; delete from body_records;",
    );
    expect((await db.query('select * from body_records')).rows).toHaveLength(0);
  });
  it('未登录用户不能读取数据或调用写入函数', async () => {
    await db.exec(
      'reset role; grant usage on schema public,auth to anon; grant select on all tables in schema public to anon; set role anon;',
    );
    expect((await db.query('select * from foods')).rows).toHaveLength(0);
    await expect(
      db.query('select save_meal_entry($1,$2,$3)', ['2026-10-05', food, 100]),
    ).rejects.toThrow('permission denied');
  });
});
