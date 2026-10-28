import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const folder = mkdtempSync(join(tmpdir(), 'sport-plan-upgrade-'));
let db: PGlite;
let exercise: string;
let workout: string;
let setId: string;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const runId = 'aaaaaaaa-1111-4111-8111-111111111111';
const rideId = 'bbbbbbbb-1111-4111-8111-111111111111';
const migration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const login = async (user = owner) =>
  db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}';`);
const save = (id = runId, revision = 0, duration: number | null = 30, activity = 'running') =>
  db.query('select save_cardio($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    id,
    revision,
    '2026-10-28',
    '08:30',
    activity,
    duration,
    activity === 'elliptical' ? null : 5,
    140,
    '晨练',
    true,
  ]);
beforeAll(async () => {
  db = new PGlite(folder);
  await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${owner}'),('${other}');`);
  await db.exec(migration('001_initial.sql'));
  await login();
  exercise = (
    await db.query<{ id: string }>("insert into exercises(name) values('卧推') returning id")
  ).rows[0].id;
  workout = (
    await db.query<{ id: string }>('select save_workout($1,$2,$3,$4::jsonb,$5) as id', [
      '2026-10-27',
      45,
      '旧训练备注',
      JSON.stringify([{ exercise_id: exercise, sets: [{ weight_kg: 60, reps: 12 }] }]),
      0,
    ])
  ).rows[0].id;
  setId = (await db.query<{ id: string }>('select id from training_sets')).rows[0].id;
  await db.exec('reset role');
  await db.exec(migration('002_notes_and_cardio.sql'));
  await login();
}, 30000);
afterAll(async () => {
  await db.close();
  // Only remove the exact temporary database directory created by this test.
  if (
    dirname(resolve(folder)) !== resolve(tmpdir()) ||
    !basename(folder).startsWith('sport-plan-upgrade-')
  )
    throw new Error('临时数据库清理路径不正确');
  rmSync(folder, { recursive: true, force: true });
});
describe.sequential('002 增量迁移、备注独立性、有氧持久化与访问安全', () => {
  it('升级已有记录：ID、重量、次数、整体备注保留；新字段兼容为空', async () => {
    expect(
      (
        await db.query<{ id: string; weight_kg: string; reps: number }>(
          'select * from training_sets',
        )
      ).rows[0],
    ).toMatchObject({ id: setId, weight_kg: '60', reps: 12 });
    expect((await db.query<{ notes: string }>('select notes from workouts')).rows[0].notes).toBe(
      '旧训练备注',
    );
    expect((await db.query<{ notes: string }>('select notes from exercises')).rows[0].notes).toBe(
      '',
    );
  });
  it('动作备注与历史组、训练备注隔离，重命名及恢复归档保持原动作 ID', async () => {
    await db.query('select save_exercise($1,$2,$3)', ['卧推', exercise, '肩胛收紧\n保持稳定']);
    await db.query('select save_exercise($1,$2)', ['杠铃卧推', exercise]);
    await db.query('update exercises set archived=true where id=$1', [exercise]);
    const restored = (
      await db.query<{ id: string }>('select save_exercise($1) as id', ['杠铃卧推'])
    ).rows[0].id;
    expect(restored).toBe(exercise);
    expect((await db.query<{ notes: string }>('select notes from exercises')).rows[0].notes).toBe(
      '肩胛收紧\n保持稳定',
    );
    expect((await db.query<{ id: string }>('select id from training_sets')).rows[0].id).toBe(setId);
    expect((await db.query<{ notes: string }>('select notes from workouts')).rows[0].notes).toBe(
      '旧训练备注',
    );
  });
  it('备注专区仅更新指定训练备注与版本，组行不删除重建，旧版本被拒绝', async () => {
    await db.query('select update_training_notes($1,$2,$3,$4)', [
      'strength',
      workout,
      '专区修改',
      1,
    ]);
    expect(
      (await db.query<{ notes: string; revision: number }>('select notes,revision from workouts'))
        .rows[0],
    ).toEqual({ notes: '专区修改', revision: 2 });
    expect((await db.query<{ id: string }>('select id from training_sets')).rows[0].id).toBe(setId);
    await expect(
      db.query('select update_training_notes($1,$2,$3,$4)', ['strength', workout, '过期修改', 1]),
    ).rejects.toThrow('已改变');
    expect((await db.query<{ notes: string }>('select notes from exercises')).rows[0].notes).toBe(
      '肩胛收紧\n保持稳定',
    );
  });
  it('有氧独立创建，同日多次保留独立 ID；允许时长/距离缺失', async () => {
    await save();
    await save(rideId, 0, 20, 'cycling');
    expect((await db.query("select * from workouts where date='2026-10-28'")).rows).toHaveLength(0);
    expect((await db.query('select * from cardio_sessions')).rows).toHaveLength(2);
    await save(runId, 1, null);
    await db.query('update cardio_sessions set distance_km=null where id=$1', [runId]);
    expect(
      (
        await db.query<{ duration_minutes: string | null }>(
          'select duration_minutes from cardio_sessions where id=$1',
          [runId],
        )
      ).rows[0].duration_minutes,
    ).toBeNull();
  });
  it('同日有氧备注按记录 ID 修改，不改变另一条；过期编辑和非法数据拒绝', async () => {
    await db.query('select update_training_notes($1,$2,$3,$4)', [
      'cardio',
      runId,
      '跑步单独备注',
      2,
    ]);
    expect(
      (await db.query<{ notes: string }>('select notes from cardio_sessions where id=$1', [rideId]))
        .rows[0].notes,
    ).toBe('晨练');
    await expect(save(runId, 2)).rejects.toThrow('已改变');
    await expect(save(runId, 3, -1)).rejects.toThrow();
    await expect(
      db.query("update cardio_sessions set activity='elliptical' where id=$1", [rideId]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ notes: string; revision: number }>(
          'select notes,revision from cardio_sessions where id=$1',
          [runId],
        )
      ).rows[0],
    ).toEqual({ notes: '跑步单独备注', revision: 3 });
  });
  it('另一身份无法读取或修改备注、有氧；匿名调用禁止', async () => {
    await login(other);
    expect((await db.query('select * from cardio_sessions')).rows).toHaveLength(0);
    await expect(
      db.query('select save_exercise($1,$2,$3)', ['恶意修改', exercise, '内容']),
    ).rejects.toThrow('不存在');
    await expect(
      db.query('select update_training_notes($1,$2,$3,$4)', ['strength', workout, '越权', 2]),
    ).rejects.toThrow('已改变');
    await expect(save(runId, 3)).rejects.toThrow('已改变');
    const snapshot = (
      await db.query<{ records: { cardio: unknown[] } }>('select get_records() as records')
    ).rows[0].records;
    expect(snapshot.cardio).toHaveLength(0);
    await db.exec(
      'reset role;grant usage on schema public,auth to anon;grant select on public.cardio_sessions to anon;set role anon;',
    );
    expect((await db.query('select * from cardio_sessions')).rows).toHaveLength(0);
    await expect(
      db.query('select update_training_notes($1,$2,$3,$4)', ['cardio', runId, '越权', 3]),
    ).rejects.toThrow('permission denied');
    await login();
  });
  it('关闭数据库并重新连接、重新登录后，新增数据和历史记录仍存在', async () => {
    await db.close();
    db = new PGlite(folder);
    await login();
    const records = (
      await db.query<{
        records: {
          schema_version: number;
          cardio: { id: string; notes: string }[];
          workouts: { notes: string }[];
          exercises: { notes: string }[];
          sets: { id: string }[];
        };
      }>('select get_records() as records')
    ).rows[0].records;
    expect(records.schema_version).toBe(2);
    expect(records.cardio).toHaveLength(2);
    expect(records.cardio.find((s) => s.id === runId)?.notes).toBe('跑步单独备注');
    expect(records.workouts[0].notes).toBe('专区修改');
    expect(records.exercises[0].notes).toContain('肩胛');
    expect(records.sets[0].id).toBe(setId);
  });
  it('有氧删除按 ID 与版本保护，另一条和力量记录不受影响', async () => {
    await expect(db.query('select delete_cardio($1,$2)', [runId, 1])).rejects.toThrow('已改变');
    await db.query('select delete_cardio($1,$2)', [runId, 3]);
    expect((await db.query('select * from cardio_sessions')).rows).toHaveLength(1);
    expect((await db.query('select * from workouts')).rows).toHaveLength(1);
    expect((await db.query('select * from training_sets')).rows).toHaveLength(1);
  });
});
