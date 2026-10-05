-- Apply once in the Supabase SQL editor. No secrets are embedded in this file.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm numeric not null check (height_cm between 100 and 250),
  age integer not null check (age between 18 and 100),
  sex text not null check (sex in ('male','female')),
  activity_factor numeric not null default 1.2 check (activity_factor between 1.2 and 1.6),
  protein_per_kg numeric not null default 1.6 check (protein_per_kg between 1.4 and 2.0),
  fat_fraction numeric not null default 0.3 check (fat_fraction between 0.2 and 0.35)
);
create table public.body_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, weight_kg numeric not null check (weight_kg between 20 and 400),
  unique(user_id,date)
);
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  archived boolean not null default false,
  unique(user_id,name), unique(id,user_id)
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, duration_minutes integer not null default 0 check (duration_minutes between 0 and 600),
  notes text not null default '' check (length(notes) <= 2000), revision integer not null default 1,
  unique(user_id,date), unique(id,user_id)
);
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(), workout_id uuid not null, exercise_id uuid not null,
  position integer not null check (position >= 0), unique(id,user_id), unique(workout_id,exercise_id),
  foreign key(workout_id,user_id) references public.workouts(id,user_id) on delete cascade,
  foreign key(exercise_id,user_id) references public.exercises(id,user_id)
);
create table public.training_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(), workout_exercise_id uuid not null,
  position integer not null check (position >= 0),
  weight_kg numeric not null check (weight_kg between 0 and 2000),
  reps integer not null check (reps between 1 and 1000),
  unique(workout_exercise_id,position),
  foreign key(workout_exercise_id,user_id) references public.workout_exercises(id,user_id) on delete cascade
);
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  base_grams numeric not null check (base_grams > 0 and base_grams <= 10000),
  calories numeric not null check (calories between 0 and 100000),
  protein numeric not null check (protein between 0 and 10000),
  carbs numeric not null check (carbs between 0 and 10000),
  fat numeric not null check (fat between 0 and 10000),
  archived boolean not null default false, unique(id,user_id)
);
create table public.meal_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, unique(user_id,date), unique(id,user_id)
);
create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(), day_id uuid not null, food_id uuid not null,
  grams numeric not null check (grams > 0 and grams <= 10000),
  -- Snapshot: editing/archiving food must not rewrite past meals.
  food_name text not null, calories numeric not null check(calories >= 0),
  protein numeric not null check(protein >= 0), carbs numeric not null check(carbs >= 0), fat numeric not null check(fat >= 0),
  created_at timestamptz not null default now(), revision integer not null default 1,
  foreign key(day_id,user_id) references public.meal_days(id,user_id) on delete cascade,
  foreign key(food_id,user_id) references public.foods(id,user_id)
);
create index workout_exercises_parent on public.workout_exercises(workout_id);
create index training_sets_parent on public.training_sets(workout_exercise_id);
create index meal_entries_parent on public.meal_entries(day_id);
create index foods_owner on public.foods(user_id);

-- RLS and composite foreign keys protect both direct access and parent ownership.
do $$ declare t text; begin
  foreach t in array array['profiles','body_records','exercises','workouts','workout_exercises','training_sets','foods','meal_days','meal_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_only on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
  end loop;
end $$;

-- JSON is only a transaction transport format. Every exercise and set is stored in its own row.
create function public.save_workout(p_date date, p_duration integer, p_notes text, p_exercises jsonb, p_revision integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare wid uuid; current_revision integer; item jsonb; s jsonb; eid uuid; pos integer := 0; sp integer;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  -- Serialize even initial creation for the same user/day.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_date::text, 0));
  select id,revision into wid,current_revision from workouts where user_id=auth.uid() and date=p_date for update;
  if coalesce(current_revision,0) <> p_revision then raise exception '记录已被其他设备修改，请刷新后重试'; end if;
  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) < 1 or jsonb_array_length(p_exercises) > 100 then
    raise exception '至少需要一个动作，最多 100 个';
  end if;
  if wid is null then
    insert into workouts(date,duration_minutes,notes) values(p_date,p_duration,p_notes) returning id into wid;
  else
    update workouts set duration_minutes=p_duration,notes=p_notes,revision=revision+1 where id=wid;
    delete from workout_exercises where workout_id=wid;
  end if;
  for item in select value from jsonb_array_elements(p_exercises) loop
    if jsonb_typeof(item->'sets') <> 'array' or coalesce(jsonb_array_length(item->'sets'),0) < 1 or jsonb_array_length(item->'sets') > 200 then
      raise exception '每个动作需要 1–200 组';
    end if;
    insert into workout_exercises(workout_id,exercise_id,position) values(wid,(item->>'exercise_id')::uuid,pos) returning id into eid;
    sp := 0;
    for s in select value from jsonb_array_elements(item->'sets') loop
      insert into training_sets(workout_exercise_id,position,weight_kg,reps) values(eid,sp,(s->>'weight_kg')::numeric,(s->>'reps')::integer);
      sp := sp+1;
    end loop;
    pos := pos+1;
  end loop;
  return wid;
end $$;
create function public.delete_workout(p_id uuid, p_revision integer) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from workouts where id=p_id and user_id=auth.uid() and revision=p_revision;
  if not found then raise exception '记录已改变，请刷新后重试'; end if;
end $$;

create function public.save_meal_entry(p_date date, p_food_id uuid, p_grams numeric, p_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare f foods; did uuid; mid uuid; old_entry meal_entries;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_id is not null then
    select * into old_entry from meal_entries where id=p_id for update;
    if not found then raise exception '饮食记录不存在，请刷新'; end if;
    if old_entry.food_id <> p_food_id then raise exception '修改记录时不能更换食品，请删除后新增'; end if;
    -- Weight edits preserve the original nutrition density, even if the food was edited.
    update meal_entries set grams=p_grams, calories=old_entry.calories*p_grams/old_entry.grams,
      protein=old_entry.protein*p_grams/old_entry.grams,carbs=old_entry.carbs*p_grams/old_entry.grams,
      fat=old_entry.fat*p_grams/old_entry.grams,revision=revision+1 where id=p_id;
    return p_id;
  end if;
  select * into f from foods where id=p_food_id and not archived;
  if not found then raise exception '食品不存在或已删除'; end if;
  insert into meal_days(date) values(p_date) on conflict(user_id,date) do update set date=excluded.date returning id into did;
  insert into meal_entries(day_id,food_id,grams,food_name,calories,protein,carbs,fat)
    values(did,f.id,p_grams,f.name,f.calories*p_grams/f.base_grams,f.protein*p_grams/f.base_grams,f.carbs*p_grams/f.base_grams,f.fat*p_grams/f.base_grams)
    returning id into mid;
  return mid;
end $$;
revoke all on function public.save_workout(date,integer,text,jsonb,integer) from public;
revoke all on function public.delete_workout(uuid,integer) from public;
revoke all on function public.save_meal_entry(date,uuid,numeric,uuid) from public;
grant execute on function public.save_workout(date,integer,text,jsonb,integer) to authenticated;
grant execute on function public.delete_workout(uuid,integer) to authenticated;
grant execute on function public.save_meal_entry(date,uuid,numeric,uuid) to authenticated;
