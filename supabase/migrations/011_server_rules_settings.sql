-- Punto Trabajo · 011 reglas de servidor, ajustes de empresa y gestión de empleados
-- Depende de 001–010. Se puede ejecutar más de una vez.
--
-- Qué hace:
--  1. El servidor decide la hora de los fichajes/pausas del propio usuario (no el móvil).
--  2. El servidor calcula dentro/fuera de geocerca (no se confía en el cliente).
--  3. Solo se aceptan posiciones durante una jornada (privacidad).
--  4. Ajustes de empresa (jornada, pausas, GPS, alertas, logo).
--  5. Alta/edición de empleados y equipos coherente (rol supervisor <-> teams.supervisor_id).
--  6. Protege al último administrador y cierra jornadas de empleados desactivados.
--  7. Corrige que el administrador no viera el perfil de los invitados.

grant usage on schema private to authenticated;

-- 1. Utilidades ----------------------------------------------------------

create or replace function private.distance_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql immutable parallel safe set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$;

create or replace function private.resolve_geofence(
  p_company uuid, p_lat double precision, p_lon double precision
) returns table (configured boolean, geofence_id uuid)
language sql security definer set search_path = '' stable
as $$
  select
    exists (select 1 from public.geofences g where g.company_id = p_company and g.active),
    (select g.id
       from public.geofences g
      where g.company_id = p_company and g.active
        and private.distance_m(p_lat, p_lon, g.latitude, g.longitude) <= g.radius_m
      order by private.distance_m(p_lat, p_lon, g.latitude, g.longitude) asc
      limit 1);
$$;

revoke all on function private.distance_m(double precision, double precision, double precision, double precision) from public, anon;
revoke all on function private.resolve_geofence(uuid, double precision, double precision) from public, anon;
grant execute on function private.distance_m(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function private.resolve_geofence(uuid, double precision, double precision) to authenticated;

-- 2. Ajustes de empresa --------------------------------------------------

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  logo_data text check (logo_data is null or length(logo_data) <= 300000),
  daily_hours numeric(4,2) not null default 8 check (daily_hours between 1 and 24),
  max_daily_hours numeric(4,2) not null default 12 check (max_daily_hours between 1 and 24),
  max_break_minutes integer not null default 60 check (max_break_minutes between 5 and 600),
  tracking_interval_s integer not null default 60 check (tracking_interval_s between 15 and 900),
  map_refresh_s integer not null default 60 check (map_refresh_s between 15 and 900),
  max_accuracy_m integer not null default 150 check (max_accuracy_m between 10 and 5000),
  require_gps_clock_in boolean not null default false,
  block_clock_in_outside_geofence boolean not null default false,
  stale_location_minutes integer not null default 10 check (stale_location_minutes between 2 and 240),
  location_retention_days integer not null default 90 check (location_retention_days between 7 and 730),
  geofence_alerts_enabled boolean not null default true,
  geofence_alert_cooldown_min integer not null default 10 check (geofence_alert_cooldown_min between 1 and 240),
  task_due_soon_hours integer not null default 24 check (task_due_soon_hours between 1 and 168),
  incident_pending_hours integer not null default 24 check (incident_pending_hours between 1 and 720),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;
revoke all on public.company_settings from anon;
revoke all on public.company_settings from authenticated;
grant select, insert, update on public.company_settings to authenticated;

drop policy if exists company_settings_select_member on public.company_settings;
create policy company_settings_select_member on public.company_settings
  for select to authenticated
  using (private.is_company_member(company_id));

drop policy if exists company_settings_insert_admin on public.company_settings;
create policy company_settings_insert_admin on public.company_settings
  for insert to authenticated
  with check (private.has_company_role(company_id, array['admin']::public.app_role[]));

drop policy if exists company_settings_update_admin on public.company_settings;
create policy company_settings_update_admin on public.company_settings
  for update to authenticated
  using (private.has_company_role(company_id, array['admin']::public.app_role[]))
  with check (private.has_company_role(company_id, array['admin']::public.app_role[]));

drop trigger if exists set_updated_at_company_settings on public.company_settings;
create trigger set_updated_at_company_settings
  before update on public.company_settings
  for each row execute function public.set_updated_at();

insert into public.company_settings (company_id)
select c.id from public.companies c
on conflict (company_id) do nothing;

create or replace function private.create_default_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.company_settings (company_id) values (new.id) on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_settings on public.companies;
create trigger create_default_settings
  after insert on public.companies
  for each row execute function private.create_default_settings();

create or replace function private.setting_num(p_company uuid, p_key text, p_default numeric)
returns numeric language sql security definer set search_path = '' stable
as $$
  select coalesce(
    (select (to_jsonb(cs) ->> p_key)::numeric from public.company_settings cs where cs.company_id = p_company),
    p_default);
$$;

create or replace function private.setting_bool(p_company uuid, p_key text, p_default boolean)
returns boolean language sql security definer set search_path = '' stable
as $$
  select coalesce(
    (select (to_jsonb(cs) ->> p_key)::boolean from public.company_settings cs where cs.company_id = p_company),
    p_default);
$$;

revoke all on function private.setting_num(uuid, text, numeric) from public, anon;
revoke all on function private.setting_bool(uuid, text, boolean) from public, anon;
grant execute on function private.setting_num(uuid, text, numeric) to authenticated;
grant execute on function private.setting_bool(uuid, text, boolean) to authenticated;

-- 3. Fichajes: hora del servidor, geocerca del servidor ------------------

create or replace function private.time_entries_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r record;
  is_self boolean;
begin
  is_self := uid is not null and new.user_id = uid;

  if is_self then
    new.started_at := now();
    new.ended_at := null;
    new.status := 'open';
    new.end_latitude := null;
    new.end_longitude := null;
    new.end_geofence_id := null;
  else
    new.started_at := coalesce(new.started_at, now());
  end if;

  if new.start_latitude is not null and new.start_longitude is not null then
    select * into r from private.resolve_geofence(new.company_id, new.start_latitude, new.start_longitude);
    new.start_geofence_id := r.geofence_id;
    if is_self and r.configured and r.geofence_id is null
       and private.setting_bool(new.company_id, 'block_clock_in_outside_geofence', false) then
      raise exception 'No puedes fichar la entrada fuera de una geocerca autorizada.';
    end if;
  else
    new.start_geofence_id := null;
    if is_self and private.setting_bool(new.company_id, 'require_gps_clock_in', false) then
      raise exception 'Necesitas activar la ubicación para fichar la entrada.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.time_entries_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_self boolean;
  r record;
begin
  if uid is null then
    return new;
  end if;
  is_self := old.user_id = uid;

  if new.company_id is distinct from old.company_id or new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar la empresa ni el empleado de un fichaje.';
  end if;

  if is_self then
    if old.status = 'closed' then
      raise exception 'La jornada ya está cerrada y no se puede modificar.';
    end if;
    if new.started_at is distinct from old.started_at
       or new.start_latitude is distinct from old.start_latitude
       or new.start_longitude is distinct from old.start_longitude
       or new.start_geofence_id is distinct from old.start_geofence_id then
      raise exception 'No puedes modificar la hora ni la ubicación de entrada.';
    end if;
    if new.status = 'closed' then
      new.ended_at := now();
    else
      new.status := 'open';
      new.ended_at := null;
    end if;
  else
    if new.status = 'closed' and new.ended_at is null then
      new.ended_at := now();
    end if;
    if new.status = 'closed' and new.ended_at > now() + interval '1 minute' then
      raise exception 'La hora de salida no puede estar en el futuro.';
    end if;
  end if;

  if new.status = 'closed' and old.status = 'open' then
    if new.end_latitude is not null and new.end_longitude is not null then
      select * into r from private.resolve_geofence(new.company_id, new.end_latitude, new.end_longitude);
      new.end_geofence_id := r.geofence_id;
    else
      new.end_geofence_id := null;
    end if;
    update public.time_entry_breaks b
       set ended_at = greatest(new.ended_at, b.started_at)
     where b.time_entry_id = new.id and b.ended_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists time_entries_before_insert on public.time_entries;
create trigger time_entries_before_insert
  before insert on public.time_entries
  for each row execute function private.time_entries_before_insert();

drop trigger if exists time_entries_before_update on public.time_entries;
create trigger time_entries_before_update
  before update on public.time_entries
  for each row execute function private.time_entries_before_update();

create or replace function private.time_entry_breaks_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is not null and new.user_id = uid then
    if not exists (
      select 1 from public.time_entries te
       where te.id = new.time_entry_id and te.company_id = new.company_id
         and te.user_id = new.user_id and te.status = 'open'
    ) then
      raise exception 'No hay una jornada abierta para iniciar la pausa.';
    end if;
    new.started_at := now();
    new.ended_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.time_entry_breaks_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new;
  end if;
  if old.user_id = uid then
    if new.time_entry_id is distinct from old.time_entry_id
       or new.user_id is distinct from old.user_id
       or new.company_id is distinct from old.company_id
       or new.started_at is distinct from old.started_at
       or new.reason is distinct from old.reason then
      raise exception 'Solo puedes terminar tu pausa.';
    end if;
    if old.ended_at is not null then
      raise exception 'La pausa ya está cerrada.';
    end if;
    new.ended_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists time_entry_breaks_before_insert on public.time_entry_breaks;
create trigger time_entry_breaks_before_insert
  before insert on public.time_entry_breaks
  for each row execute function private.time_entry_breaks_before_insert();

drop trigger if exists time_entry_breaks_before_update on public.time_entry_breaks;
create trigger time_entry_breaks_before_update
  before update on public.time_entry_breaks
  for each row execute function private.time_entry_breaks_before_update();

-- 4. Posiciones: solo durante la jornada, geocerca calculada en servidor --

create or replace function private.location_events_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r record;
begin
  if new.recorded_at is null or new.recorded_at > now() then
    new.recorded_at := now();
  end if;
  if new.recorded_at < now() - interval '2 days' then
    return null;
  end if;

  if uid is not null and new.user_id = uid then
    if not exists (
      select 1 from public.time_entries te
       where te.company_id = new.company_id and te.user_id = new.user_id
         and te.started_at <= new.recorded_at
         and (te.ended_at is null or te.ended_at + interval '2 minutes' >= new.recorded_at)
    ) then
      return null;
    end if;
  end if;

  select * into r from private.resolve_geofence(new.company_id, new.latitude, new.longitude);
  new.geofence_id := r.geofence_id;
  if r.configured then
    new.inside_geofence := (r.geofence_id is not null);
  else
    new.inside_geofence := null;
  end if;
  new.source := coalesce(nullif(new.source, ''), 'device');
  return new;
end;
$$;

drop trigger if exists location_events_before_insert on public.location_events;
create trigger location_events_before_insert
  before insert on public.location_events
  for each row execute function private.location_events_before_insert();

create index if not exists location_events_company_recorded_user_idx
  on public.location_events (company_id, recorded_at desc, user_id);

-- Última posición por empleado (respeta RLS: el encargado solo ve su equipo).
create or replace function public.latest_locations(
  p_company_id uuid,
  p_since interval default interval '12 hours'
) returns table (
  user_id uuid, full_name text, latitude double precision, longitude double precision,
  accuracy_m double precision, recorded_at timestamptz, inside_geofence boolean,
  geofence_id uuid, shift_open boolean
)
language sql security invoker set search_path = '' stable
as $$
  select distinct on (le.user_id)
    le.user_id, p.full_name, le.latitude, le.longitude, le.accuracy_m, le.recorded_at,
    le.inside_geofence, le.geofence_id,
    exists (
      select 1 from public.time_entries te
       where te.company_id = le.company_id and te.user_id = le.user_id and te.status = 'open'
    ) as shift_open
  from public.location_events le
  left join public.profiles p on p.id = le.user_id
  where le.company_id = p_company_id
    and le.recorded_at >= now() - p_since
  order by le.user_id, le.recorded_at desc;
$$;

revoke all on function public.latest_locations(uuid, interval) from public, anon;
grant execute on function public.latest_locations(uuid, interval) to authenticated;

-- Borrado de posiciones antiguas (solo administrador, según los días de retención).
create or replace function private.purge_old_locations(p_company_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
  keep_days integer;
begin
  if (select auth.uid()) is null or not private.has_company_role(p_company_id, array['admin']::public.app_role[]) then
    raise exception 'No tienes permisos para gestionar esta empresa.';
  end if;
  keep_days := private.setting_num(p_company_id, 'location_retention_days', 90)::integer;
  delete from public.location_events
   where company_id = p_company_id and recorded_at < now() - make_interval(days => keep_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.purge_old_locations(p_company_id uuid)
returns integer language sql security invoker set search_path = ''
as $$ select private.purge_old_locations(p_company_id); $$;

revoke all on function private.purge_old_locations(uuid) from public, anon;
revoke all on function public.purge_old_locations(uuid) from public, anon;
grant execute on function private.purge_old_locations(uuid) to authenticated;
grant execute on function public.purge_old_locations(uuid) to authenticated;

-- 5. Equipos y membresías -------------------------------------------------

create or replace function private.teams_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.supervisor_id is not null and not exists (
    select 1 from public.company_memberships cm
     where cm.company_id = new.company_id and cm.user_id = new.supervisor_id
       and cm.role = 'supervisor' and cm.status = 'active'
  ) then
    raise exception 'El responsable del equipo debe ser un encargado activo de la empresa.';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_guard on public.teams;
create trigger teams_guard
  before insert or update of supervisor_id on public.teams
  for each row execute function private.teams_guard();

create or replace function private.memberships_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  other_admins integer;
  needs_check boolean := false;
begin
  if old.role = 'admin' and old.status = 'active'
     and exists (select 1 from public.companies c where c.id = old.company_id) then
    if tg_op = 'DELETE' then
      needs_check := true;
    else
      needs_check := (new.role <> 'admin' or new.status <> 'active');
    end if;
    if needs_check then
      select count(*) into other_admins
        from public.company_memberships cm
       where cm.company_id = old.company_id and cm.role = 'admin'
         and cm.status = 'active' and cm.user_id <> old.user_id;
      if other_admins = 0 then
        raise exception 'La empresa debe conservar al menos un administrador activo.';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'disabled' and old.status <> 'disabled' then
      update public.time_entry_breaks
         set ended_at = now()
       where company_id = old.company_id and user_id = old.user_id and ended_at is null;
      update public.time_entries
         set status = 'closed', ended_at = now(),
             notes = concat_ws(E'\n', notes, 'Jornada cerrada automáticamente al desactivar al empleado.')
       where company_id = old.company_id and user_id = old.user_id and status = 'open';
    end if;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists memberships_guard on public.company_memberships;
create trigger memberships_guard
  before update or delete on public.company_memberships
  for each row execute function private.memberships_guard();


-- Al aceptar la invitación, un encargado pasa a ser responsable de su equipo si este no tiene uno.
create or replace function private.memberships_after_activate()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'supervisor' and new.status = 'active' then
    update public.teams t set supervisor_id = new.user_id
     where t.company_id = new.company_id and t.supervisor_id is null
       and exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = new.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists memberships_after_activate on public.company_memberships;
create trigger memberships_after_activate
  after update of status, role on public.company_memberships
  for each row
  when (new.status = 'active' and (old.status is distinct from new.status or old.role is distinct from new.role))
  execute function private.memberships_after_activate();

-- Alta/edición de empleado en una sola operación atómica (solo administrador).
create or replace function private.admin_update_employee(
  p_company_id uuid, p_user_id uuid, p_full_name text, p_job_title text,
  p_role public.app_role, p_status public.membership_status, p_team_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not private.has_company_role(p_company_id, array['admin']::public.app_role[]) then
    raise exception 'No tienes permisos para gestionar esta empresa.';
  end if;
  if not exists (select 1 from public.company_memberships cm where cm.company_id = p_company_id and cm.user_id = p_user_id) then
    raise exception 'El empleado no pertenece a la empresa.';
  end if;
  if p_team_id is not null and not exists (select 1 from public.teams t where t.id = p_team_id and t.company_id = p_company_id) then
    raise exception 'El equipo no pertenece a la empresa.';
  end if;

  update public.company_memberships
     set role = p_role, status = p_status, job_title = nullif(btrim(coalesce(p_job_title, '')), '')
   where company_id = p_company_id and user_id = p_user_id;

  if p_full_name is not null and btrim(p_full_name) <> '' then
    update public.profiles set full_name = btrim(p_full_name) where id = p_user_id;
  end if;

  if p_role <> 'supervisor' then
    update public.teams set supervisor_id = null
     where company_id = p_company_id and supervisor_id = p_user_id;
  end if;

  delete from public.team_members tm
   using public.teams t
   where tm.team_id = t.id and t.company_id = p_company_id and tm.user_id = p_user_id
     and (p_team_id is null or tm.team_id <> p_team_id);

  if p_team_id is not null then
    insert into public.team_members (team_id, user_id) values (p_team_id, p_user_id)
    on conflict do nothing;
    if p_role = 'supervisor' then
      update public.teams set supervisor_id = p_user_id
       where id = p_team_id and supervisor_id is null;
    end if;
  end if;
end;
$$;

create or replace function public.admin_update_employee(
  p_company_id uuid, p_user_id uuid, p_full_name text, p_job_title text,
  p_role public.app_role, p_status public.membership_status, p_team_id uuid
) returns void
language sql security invoker set search_path = ''
as $$ select private.admin_update_employee($1, $2, $3, $4, $5, $6, $7); $$;

revoke all on function private.admin_update_employee(uuid, uuid, text, text, public.app_role, public.membership_status, uuid) from public, anon;
revoke all on function public.admin_update_employee(uuid, uuid, text, text, public.app_role, public.membership_status, uuid) from public, anon;
grant execute on function private.admin_update_employee(uuid, uuid, text, text, public.app_role, public.membership_status, uuid) to authenticated;
grant execute on function public.admin_update_employee(uuid, uuid, text, text, public.app_role, public.membership_status, uuid) to authenticated;

-- 6. El administrador debe ver el perfil de invitados y desactivados ------

drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.company_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = 'admin'
      and exists (
        select 1 from public.company_memberships target
        where target.user_id = public.profiles.id
          and target.company_id = cm.company_id
      )
  )
  or exists (
    select 1 from public.company_memberships target
    where target.user_id = public.profiles.id
      and target.status = 'active'
      and private.is_manager_for_user(target.company_id, target.user_id)
  )
);