-- Punto Trabajo · 013 notificaciones y alertas de geocerca en servidor
-- Depende de 011 y 012. Se puede ejecutar más de una vez.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null default gen_random_uuid()::text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function private.notify(
  p_company uuid, p_user uuid, p_kind text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null then
    return;
  end if;
  if not exists (
    select 1 from public.company_memberships cm
     where cm.company_id = p_company and cm.user_id = p_user and cm.status = 'active'
  ) then
    return;
  end if;
  insert into public.notifications (company_id, user_id, kind, title, body, entity_type, entity_id, dedupe_key)
  values (p_company, p_user, p_kind, p_title, p_body, p_entity_type, p_entity_id,
          coalesce(p_dedupe, gen_random_uuid()::text))
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- Avisa a los administradores y al encargado del equipo del empleado indicado.
create or replace function private.notify_managers(
  p_company uuid, p_about_user uuid, p_exclude uuid, p_kind text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct cm.user_id
      from public.company_memberships cm
     where cm.company_id = p_company and cm.status = 'active'
       and (
         cm.role = 'admin'
         or (cm.role = 'supervisor' and p_about_user is not null and exists (
              select 1 from public.teams t
                join public.team_members tm on tm.team_id = t.id
               where t.company_id = p_company and t.supervisor_id = cm.user_id and tm.user_id = p_about_user))
       )
       and (p_exclude is null or cm.user_id <> p_exclude)
  loop
    perform private.notify(p_company, r.user_id, p_kind, p_title, p_body, p_entity_type, p_entity_id, p_dedupe);
  end loop;
end;
$$;

revoke all on function private.notify(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.notify_managers(uuid, uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;

-- Incidencias nuevas y cambios de estado ------------------------------------

create or replace function private.incidents_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  actor uuid;
  who text;
  label text;
begin
  actor := coalesce(uid, new.created_by);
  select p.full_name into who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' then
    if new.type = 'geofencing' then
      perform private.notify_managers(new.company_id, new.user_id, null, 'geofence_exit',
        'Salida de geocerca', coalesce(new.description, new.title), 'incident', new.id, null);
    else
      perform private.notify_managers(new.company_id, new.user_id, actor, 'incident_new',
        'Nueva incidencia', new.title || coalesce(' · ' || who, ''), 'incident', new.id, null);
      if new.user_id is not null and new.user_id <> actor then
        perform private.notify(new.company_id, new.user_id, 'incident_new',
          'Nueva incidencia a tu nombre', new.title, 'incident', new.id, null);
      end if;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status and new.user_id is not null and new.user_id is distinct from uid then
    label := case new.status when 'open' then 'reabierta' when 'review' then 'en revisión' else 'cerrada' end;
    perform private.notify(new.company_id, new.user_id, 'incident_update',
      'Incidencia ' || label, new.title, 'incident', new.id, null);
  end if;
  return null;
end;
$$;

drop trigger if exists incidents_notify on public.incidents;
create trigger incidents_notify after insert or update on public.incidents
  for each row execute function private.incidents_notify();

-- Tareas asignadas y completadas --------------------------------------------

create or replace function private.tasks_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to is distinct from uid then
      perform private.notify(new.company_id, new.assigned_to, 'task_assigned',
        'Tarea asignada', new.title, 'task', new.id, null);
    end if;
    return null;
  end if;

  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is distinct from uid then
    perform private.notify(new.company_id, new.assigned_to, 'task_assigned',
      'Tarea asignada', new.title, 'task', new.id, null);
  end if;

  if new.status = 'completed' and old.status <> 'completed'
     and new.created_by is distinct from uid then
    perform private.notify(new.company_id, new.created_by, 'task_completed',
      'Tarea completada', new.title, 'task', new.id, null);
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update on public.tasks
  for each row execute function private.tasks_notify();

-- Alerta de salida de geocerca -----------------------------------------------
-- Se crea una única incidencia por salida (inside -> outside) y con enfriamiento.

create or replace function private.location_events_alert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  shift_id uuid;
  shift_started timestamptz;
  shift_geo uuid;
  prev_inside boolean;
  recent uuid;
  who text;
  tz text;
  cooldown integer;
begin
  if new.inside_geofence is distinct from false then
    return null;
  end if;
  if not private.setting_bool(new.company_id, 'geofence_alerts_enabled', true) then
    return null;
  end if;
  if new.accuracy_m is not null
     and new.accuracy_m > private.setting_num(new.company_id, 'max_accuracy_m', 150) then
    return null;
  end if;

  select te.id, te.started_at, te.start_geofence_id
    into shift_id, shift_started, shift_geo
    from public.time_entries te
   where te.company_id = new.company_id and te.user_id = new.user_id and te.status = 'open'
   order by te.started_at desc limit 1;
  if shift_id is null then
    return null;
  end if;

  select le.inside_geofence into prev_inside
    from public.location_events le
   where le.company_id = new.company_id and le.user_id = new.user_id
     and le.id <> new.id and le.inside_geofence is not null
     and le.recorded_at >= shift_started and le.recorded_at <= new.recorded_at
   order by le.recorded_at desc limit 1;
  if not found then
    prev_inside := (shift_geo is not null);
  end if;
  if prev_inside is distinct from true then
    return null;
  end if;

  cooldown := private.setting_num(new.company_id, 'geofence_alert_cooldown_min', 10)::integer;
  select i.id into recent
    from public.incidents i
   where i.company_id = new.company_id and i.user_id = new.user_id and i.type = 'geofencing'
     and i.created_at > now() - make_interval(mins => cooldown)
   limit 1;
  if recent is not null then
    return null;
  end if;

  select p.full_name into who from public.profiles p where p.id = new.user_id;
  select coalesce(c.timezone, 'Europe/Madrid') into tz from public.companies c where c.id = new.company_id;

  insert into public.incidents (company_id, title, description, user_id, type, status, created_by)
  values (
    new.company_id,
    'Salida de geocerca',
    format('%s ha salido de la zona de trabajo a las %s (precisión ±%s m).',
      coalesce(who, 'El empleado'),
      to_char(new.recorded_at at time zone coalesce(tz, 'Europe/Madrid'), 'HH24:MI'),
      coalesce(round(new.accuracy_m)::text, '?')),
    new.user_id, 'geofencing', 'open', new.user_id);
  return null;
end;
$$;

drop trigger if exists location_events_alert on public.location_events;
create trigger location_events_alert after insert on public.location_events
  for each row execute function private.location_events_alert();

-- Avisos periódicos (vencimientos, pendientes, sin señal) --------------------
-- Idempotente: cada aviso tiene clave única por usuario. Lo invoca la app cada pocos minutos.

create or replace function private.run_notification_checks()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c record;
  t record;
  tz text;
  due_h integer;
  pend_h integer;
  stale_m integer;
  max_day numeric;
  max_break integer;
begin
  if uid is null then
    return;
  end if;

  for c in
    select cm.company_id from public.company_memberships cm
     where cm.user_id = uid and cm.status = 'active'
  loop
    select coalesce(co.timezone, 'Europe/Madrid') into tz from public.companies co where co.id = c.company_id;
    due_h := private.setting_num(c.company_id, 'task_due_soon_hours', 24)::integer;
    pend_h := private.setting_num(c.company_id, 'incident_pending_hours', 24)::integer;
    stale_m := private.setting_num(c.company_id, 'stale_location_minutes', 10)::integer;
    max_day := private.setting_num(c.company_id, 'max_daily_hours', 12);
    max_break := private.setting_num(c.company_id, 'max_break_minutes', 60)::integer;

    for t in
      select tk.id, tk.title, tk.assigned_to, tk.due_at
        from public.tasks tk
       where tk.company_id = c.company_id and tk.status in ('pending', 'in_progress')
         and tk.assigned_to is not null
         and tk.due_at > now() and tk.due_at <= now() + make_interval(hours => due_h)
    loop
      perform private.notify(c.company_id, t.assigned_to, 'task_due_soon', 'Tarea próxima a vencer',
        format('«%s» vence el %s.', t.title, to_char(t.due_at at time zone tz, 'DD/MM/YYYY HH24:MI')),
        'task', t.id, 'task_due_soon:' || t.id::text || ':' || to_char(t.due_at, 'YYYYMMDDHH24MI'));
    end loop;

    for t in
      select tk.id, tk.title, tk.assigned_to, tk.due_at
        from public.tasks tk
       where tk.company_id = c.company_id and tk.status in ('pending', 'in_progress')
         and tk.assigned_to is not null and tk.due_at <= now()
    loop
      perform private.notify(c.company_id, t.assigned_to, 'task_overdue', 'Tarea vencida',
        format('«%s» venció el %s.', t.title, to_char(t.due_at at time zone tz, 'DD/MM/YYYY HH24:MI')),
        'task', t.id, 'task_overdue:' || t.id::text || ':' || to_char(t.due_at, 'YYYYMMDDHH24MI'));
      perform private.notify_managers(c.company_id, t.assigned_to, null, 'task_overdue', 'Tarea vencida',
        format('«%s» venció el %s.', t.title, to_char(t.due_at at time zone tz, 'DD/MM/YYYY HH24:MI')),
        'task', t.id, 'task_overdue:' || t.id::text || ':' || to_char(t.due_at, 'YYYYMMDDHH24MI'));
    end loop;

    for t in
      select i.id, i.title, i.user_id
        from public.incidents i
       where i.company_id = c.company_id and i.status = 'open'
         and i.created_at < now() - make_interval(hours => pend_h)
    loop
      perform private.notify_managers(c.company_id, t.user_id, null, 'incident_pending', 'Incidencia pendiente',
        t.title || ' lleva más de ' || pend_h || ' h sin revisar.',
        'incident', t.id, 'incident_pending:' || t.id::text || ':' || to_char(now() at time zone tz, 'YYYYMMDD'));
    end loop;

    for t in
      select te.id, te.user_id, p.full_name
        from public.time_entries te
        join public.profiles p on p.id = te.user_id
       where te.company_id = c.company_id and te.status = 'open'
         and te.started_at < now() - make_interval(mins => stale_m)
         and not exists (select 1 from public.time_entry_breaks b where b.time_entry_id = te.id and b.ended_at is null)
         and coalesce((select max(le.recorded_at) from public.location_events le
                        where le.company_id = te.company_id and le.user_id = te.user_id
                          and le.recorded_at >= te.started_at), te.started_at)
             < now() - make_interval(mins => stale_m)
    loop
      perform private.notify_managers(c.company_id, t.user_id, null, 'location_stale', 'Sin señal de ubicación',
        coalesce(t.full_name, 'Un empleado') || ' no envía ubicación desde hace más de ' || stale_m || ' min.',
        'time_entry', t.id, 'location_stale:' || t.id::text || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24'));
    end loop;

    for t in
      select te.id, te.user_id, p.full_name
        from public.time_entries te
        join public.profiles p on p.id = te.user_id
       where te.company_id = c.company_id and te.status = 'open'
         and te.started_at < now() - make_interval(hours => max_day::integer)
    loop
      perform private.notify_managers(c.company_id, t.user_id, null, 'long_shift', 'Jornada abierta demasiado tiempo',
        coalesce(t.full_name, 'Un empleado') || ' lleva más de ' || max_day::integer || ' h con la jornada abierta.',
        'time_entry', t.id, 'long_shift:' || t.id::text);
    end loop;

    for t in
      select b.id, b.time_entry_id, b.user_id, p.full_name
        from public.time_entry_breaks b
        join public.profiles p on p.id = b.user_id
       where b.company_id = c.company_id and b.ended_at is null
         and b.started_at < now() - make_interval(mins => max_break)
    loop
      perform private.notify_managers(c.company_id, t.user_id, null, 'long_break', 'Pausa demasiado larga',
        coalesce(t.full_name, 'Un empleado') || ' lleva más de ' || max_break || ' min en pausa.',
        'time_entry', t.time_entry_id, 'long_break:' || t.id::text);
    end loop;
  end loop;

  delete from public.notifications where user_id = uid and created_at < now() - interval '90 days';
end;
$$;

create or replace function public.run_notification_checks()
returns void language sql security invoker set search_path = ''
as $$ select private.run_notification_checks(); $$;

revoke all on function private.run_notification_checks() from public, anon;
revoke all on function public.run_notification_checks() from public, anon;
grant execute on function private.run_notification_checks() to authenticated;
grant execute on function public.run_notification_checks() to authenticated;