-- Punto Trabajo · initial multi-company database
-- Designed for Supabase Auth + Postgres RLS.
-- Apply through Supabase SQL Editor or, preferably, a version-controlled migration.

create extension if not exists pgcrypto;

create schema if not exists private;

do $$ begin
  create type public.app_role as enum ('admin','supervisor','employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active','invited','disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('pending','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.incident_status as enum ('open','review','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.time_entry_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'Europe/Madrid',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'employee',
  status public.membership_status not null default 'active',
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(team_id, user_id)
);

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null check (radius_m between 10 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  status public.time_entry_status not null default 'open',
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  start_geofence_id uuid references public.geofences(id) on delete set null,
  end_geofence_id uuid references public.geofences(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists time_entries_one_open_per_user
  on public.time_entries(company_id, user_id)
  where status = 'open';

create table if not exists public.location_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  recorded_at timestamptz not null default now(),
  source text not null default 'device',
  inside_geofence boolean,
  geofence_id uuid references public.geofences(id) on delete set null
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  priority smallint not null default 2 check (priority between 1 and 3),
  status public.task_status not null default 'pending',
  due_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  user_id uuid references public.profiles(id) on delete set null,
  type text not null default 'operational',
  status public.incident_status not null default 'open',
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_memberships_user_idx on public.company_memberships(user_id);
create index if not exists company_memberships_company_idx on public.company_memberships(company_id);
create index if not exists team_members_user_idx on public.team_members(user_id);
create index if not exists teams_company_idx on public.teams(company_id);
create index if not exists geofences_company_idx on public.geofences(company_id);
create index if not exists time_entries_company_user_started_idx on public.time_entries(company_id, user_id, started_at desc);
create index if not exists location_events_company_user_recorded_idx on public.location_events(company_id, user_id, recorded_at desc);
create index if not exists tasks_company_status_due_idx on public.tasks(company_id, status, due_at);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);
create index if not exists incidents_company_status_created_idx on public.incidents(company_id, status, created_at desc);
create index if not exists audit_logs_company_created_idx on public.audit_logs(company_id, created_at desc);

-- Security-definer helpers avoid recursive RLS checks when resolving membership.
create or replace function private.user_company_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select cm.company_id
  from public.company_memberships cm
  where cm.user_id = (select auth.uid())
    and cm.status = 'active';
$$;

create or replace function private.user_ids_in_my_companies()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select cm.user_id
  from public.company_memberships cm
  where cm.company_id in (select private.user_company_ids())
    and cm.status = 'active';
$$;

create or replace function private.has_company_role(p_company_id uuid, p_roles public.app_role[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any(p_roles)
  );
$$;

create or replace function private.is_company_member(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_company_id in (select private.user_company_ids());
$$;

revoke all on function private.user_company_ids() from public;
revoke all on function private.user_ids_in_my_companies() from public;
revoke all on function private.has_company_role(uuid, public.app_role[]) from public;
revoke all on function private.is_company_member(uuid) from public;
grant execute on function private.user_company_ids() to authenticated;
grant execute on function private.user_ids_in_my_companies() to authenticated;
grant execute on function private.has_company_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.is_company_member(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'companies','profiles','company_memberships','teams','team_members',
    'geofences','time_entries','location_events','tasks','incidents','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Companies
 drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
  for select to authenticated
  using (private.is_company_member(id));

 drop policy if exists companies_insert_creator on public.companies;
create policy companies_insert_creator on public.companies
  for insert to authenticated
  with check (created_by = (select auth.uid()));

 drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin on public.companies
  for update to authenticated
  using (private.has_company_role(id, array['admin']::public.app_role[]))
  with check (private.has_company_role(id, array['admin']::public.app_role[]));

-- Profiles
 drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
  for select to authenticated
  using (id in (select private.user_ids_in_my_companies()));

 drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

 drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.user_ids_in_my_companies())
  )
  with check (id = (select auth.uid()) or id in (select private.user_ids_in_my_companies()));

-- Memberships
 drop policy if exists memberships_select_scope on public.company_memberships;
create policy memberships_select_scope on public.company_memberships
  for select to authenticated
  using (private.is_company_member(company_id));

 drop policy if exists memberships_insert_admin_or_self on public.company_memberships;
create policy memberships_insert_admin_or_self on public.company_memberships
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.has_company_role(company_id, array['admin']::public.app_role[])
  );

 drop policy if exists memberships_update_admin on public.company_memberships;
create policy memberships_update_admin on public.company_memberships
  for update to authenticated
  using (private.has_company_role(company_id, array['admin']::public.app_role[]))
  with check (private.has_company_role(company_id, array['admin']::public.app_role[]));

 drop policy if exists memberships_delete_admin on public.company_memberships;
create policy memberships_delete_admin on public.company_memberships
  for delete to authenticated
  using (private.has_company_role(company_id, array['admin']::public.app_role[]));

-- Generic company-scoped tables
 drop policy if exists teams_select_scope on public.teams;
create policy teams_select_scope on public.teams for select to authenticated using (private.is_company_member(company_id));
drop policy if exists teams_write_admin_supervisor on public.teams;
create policy teams_write_admin_supervisor on public.teams for all to authenticated
  using (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]))
  with check (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));

 drop policy if exists team_members_select_scope on public.team_members;
create policy team_members_select_scope on public.team_members for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and private.is_company_member(t.company_id)));
drop policy if exists team_members_write_admin_supervisor on public.team_members;
create policy team_members_write_admin_supervisor on public.team_members for all to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and private.has_company_role(t.company_id, array['admin','supervisor']::public.app_role[])))
  with check (exists (select 1 from public.teams t where t.id = team_id and private.has_company_role(t.company_id, array['admin','supervisor']::public.app_role[])));

-- Geofences: managers only to edit; members can read their company's zones.
drop policy if exists geofences_select_scope on public.geofences;
create policy geofences_select_scope on public.geofences for select to authenticated using (private.is_company_member(company_id));
drop policy if exists geofences_write_admin_supervisor on public.geofences;
create policy geofences_write_admin_supervisor on public.geofences for all to authenticated
  using (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]))
  with check (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));

-- Time entries: employee sees/manages own; managers see/manage company entries.
drop policy if exists time_entries_select_scope on public.time_entries;
create policy time_entries_select_scope on public.time_entries for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
  );
drop policy if exists time_entries_insert_scope on public.time_entries;
create policy time_entries_insert_scope on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));
drop policy if exists time_entries_update_scope on public.time_entries;
create policy time_entries_update_scope on public.time_entries for update to authenticated
  using (user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]))
  with check (user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));

-- Locations: employee inserts their own; managers can review company locations.
drop policy if exists location_events_select_scope on public.location_events;
create policy location_events_select_scope on public.location_events for select to authenticated
  using (user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));
drop policy if exists location_events_insert_self on public.location_events;
create policy location_events_insert_self on public.location_events for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_company_member(company_id));

-- Tasks
 drop policy if exists tasks_select_scope on public.tasks;
create policy tasks_select_scope on public.tasks for select to authenticated
  using (
    private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
    or assigned_to = (select auth.uid())
  );
drop policy if exists tasks_insert_manager on public.tasks;
create policy tasks_insert_manager on public.tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
  );
drop policy if exists tasks_update_scope on public.tasks;
create policy tasks_update_scope on public.tasks for update to authenticated
  using (
    private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
    or assigned_to = (select auth.uid())
  )
  with check (
    private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
    or assigned_to = (select auth.uid())
  );

drop policy if exists tasks_delete_manager on public.tasks;
create policy tasks_delete_manager on public.tasks for delete to authenticated
  using (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));

-- Incidents
 drop policy if exists incidents_select_scope on public.incidents;
create policy incidents_select_scope on public.incidents for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[])
  );
drop policy if exists incidents_insert_member on public.incidents;
create policy incidents_insert_member on public.incidents for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_company_member(company_id));
drop policy if exists incidents_update_manager_or_owner on public.incidents;
create policy incidents_update_manager_or_owner on public.incidents for update to authenticated
  using (created_by = (select auth.uid()) or user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]))
  with check (created_by = (select auth.uid()) or user_id = (select auth.uid()) or private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));

-- Audit logs: read by managers, insert only as the current actor.
drop policy if exists audit_logs_select_manager on public.audit_logs;
create policy audit_logs_select_manager on public.audit_logs for select to authenticated
  using (private.has_company_role(company_id, array['admin','supervisor']::public.app_role[]));
drop policy if exists audit_logs_insert_actor on public.audit_logs;
create policy audit_logs_insert_actor on public.audit_logs for insert to authenticated
  with check (actor_id = (select auth.uid()) and private.is_company_member(company_id));

-- Lock down Data API grants; service_role remains server-side and bypasses RLS.
revoke all on public.companies, public.profiles, public.company_memberships, public.teams,
  public.team_members, public.geofences, public.time_entries, public.location_events,
  public.tasks, public.incidents, public.audit_logs from anon;

grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.company_memberships to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.geofences to authenticated;
grant select, insert, update on public.time_entries to authenticated;
grant select, insert on public.location_events to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update on public.incidents to authenticated;
grant select, insert on public.audit_logs to authenticated;

-- Keep updated_at current on mutable tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['companies','profiles','company_memberships','teams','geofences','time_entries','tasks','incidents'] loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_updated_at_' || t, t);
  end loop;
end $$;

-- NOTE: Do not put the Supabase service_role key in browser code.
