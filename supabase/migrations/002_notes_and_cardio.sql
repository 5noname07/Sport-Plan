-- Existing installations: run this once after 001_initial.sql, before deploying the new frontend.
-- Additive migration: no old rows, IDs, foreign keys, sets or workout notes are rewritten.
begin;
alter table public.exercises add column notes text not null default '' check (length(notes) <= 4000);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  start_time time without time zone,
  activity text not null check (activity in ('running','cycling','swimming','elliptical','walking','other')),
  duration_minutes numeric check (duration_minutes > 0 and duration_minutes <= 1440),
  distance_km numeric check (distance_km > 0 and distance_km <= 2000),
  average_heart_rate integer check (average_heart_rate between 20 and 250),
  notes text not null default '' check (length(notes) <= 2000),
  include_in_nutrition boolean not null default true,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  check (activity not in ('elliptical','other') or distance_km is null)
);
create index cardio_sessions_owner_date on public.cardio_sessions(user_id,date);
alter table public.cardio_sessions enable row level security;
create policy owner_only on public.cardio_sessions for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.cardio_sessions to authenticated;

-- Optional p_notes: old clients renaming or reactivating an exercise cannot erase new notes.
create function public.save_exercise(p_name text, p_id uuid default null, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare eid uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_id is null then
    insert into exercises(name,notes) values(trim(p_name),coalesce(p_notes,''))
      on conflict(user_id,name) do update set archived=false,
        notes=case when p_notes is null then exercises.notes else excluded.notes end
      returning id into eid;
  else
    update exercises set name=trim(p_name),notes=coalesce(p_notes,notes)
      where id=p_id and user_id=auth.uid() returning id into eid;
    if not found then raise exception '动作不存在，请刷新'; end if;
  end if;
  return eid;
end $$;

create function public.save_cardio(p_id uuid, p_revision integer, p_date date, p_start_time time,
  p_activity text, p_duration numeric, p_distance numeric, p_heart_rate integer, p_notes text, p_include boolean)
returns uuid language plpgsql security invoker set search_path = public as $$
declare current_revision integer;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_id is null then raise exception '有氧记录缺少 ID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cardio:' || p_id::text,0));
  select revision into current_revision from cardio_sessions where id=p_id and user_id=auth.uid() for update;
  if coalesce(current_revision,0) is distinct from p_revision then
    raise exception '有氧记录已改变，请刷新后重新打开编辑';
  end if;
  if current_revision is null then
    insert into cardio_sessions(id,date,start_time,activity,duration_minutes,distance_km,average_heart_rate,notes,include_in_nutrition)
      values(p_id,p_date,p_start_time,p_activity,p_duration,p_distance,p_heart_rate,p_notes,p_include);
  else
    update cardio_sessions set date=p_date,start_time=p_start_time,activity=p_activity,duration_minutes=p_duration,
      distance_km=p_distance,average_heart_rate=p_heart_rate,notes=p_notes,include_in_nutrition=p_include,revision=revision+1
      where id=p_id and user_id=auth.uid();
  end if;
  return p_id;
end $$;
create function public.delete_cardio(p_id uuid,p_revision integer) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from cardio_sessions where id=p_id and user_id=auth.uid() and revision=p_revision;
  if not found then raise exception '有氧记录已改变，请刷新后重试'; end if;
end $$;

-- Updating a note must not serialize and replace exercise/set rows.
-- Identity is type + UUID, never just a calendar day; the shared revision prevents lost updates.
create function public.update_training_notes(p_kind text,p_id uuid,p_notes text,p_revision integer) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_kind='strength' then
    update workouts set notes=p_notes,revision=revision+1
      where id=p_id and user_id=auth.uid() and revision=p_revision;
  elsif p_kind='cardio' then
    update cardio_sessions set notes=p_notes,revision=revision+1
      where id=p_id and user_id=auth.uid() and revision=p_revision;
  else
    raise exception '未知训练类型';
  end if;
  if not found then raise exception '训练记录已改变，请刷新后重新打开编辑'; end if;
end $$;

create or replace function public.get_records() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'schema_version',2,
    'profile',(select to_jsonb(p) from profiles p where p.user_id=auth.uid()),
    'body',coalesce((select jsonb_agg(b) from body_records b where b.user_id=auth.uid()),'[]'::jsonb),
    'exercises',coalesce((select jsonb_agg(e) from exercises e where e.user_id=auth.uid()),'[]'::jsonb),
    'workouts',coalesce((select jsonb_agg(w) from workouts w where w.user_id=auth.uid()),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(l) from workout_exercises l where l.user_id=auth.uid()),'[]'::jsonb),
    'sets',coalesce((select jsonb_agg(s) from training_sets s where s.user_id=auth.uid()),'[]'::jsonb),
    'foods',coalesce((select jsonb_agg(f) from foods f where f.user_id=auth.uid()),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(d) from meal_days d where d.user_id=auth.uid()),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(m) from meal_entries m where m.user_id=auth.uid()),'[]'::jsonb),
    'cardio',coalesce((select jsonb_agg(c) from cardio_sessions c where c.user_id=auth.uid()),'[]'::jsonb)
  );
$$;
revoke all on function public.save_exercise(text,uuid,text) from public,anon;
revoke all on function public.save_cardio(uuid,integer,date,time,text,numeric,numeric,integer,text,boolean) from public,anon;
revoke all on function public.delete_cardio(uuid,integer) from public,anon;
revoke all on function public.update_training_notes(text,uuid,text,integer) from public,anon;
revoke all on function public.get_records() from public,anon;
grant execute on function public.save_exercise(text,uuid,text) to authenticated;
grant execute on function public.save_cardio(uuid,integer,date,time,text,numeric,numeric,integer,text,boolean) to authenticated;
grant execute on function public.delete_cardio(uuid,integer) to authenticated;
grant execute on function public.update_training_notes(text,uuid,text,integer) to authenticated;
grant execute on function public.get_records() to authenticated;
notify pgrst, 'reload schema';
commit;
