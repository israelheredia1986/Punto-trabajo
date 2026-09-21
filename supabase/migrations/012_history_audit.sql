-- Punto Trabajo · 012 historial de incidencias/tareas y auditoría
-- Depende de 011. Se puede ejecutar más de una vez.

alter table public.incidents
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution_comment text,
  add column if not exists reopen_count integer not null default 0;

alter table public.tasks
  add column if not exists completed_at timestamptz;

create index if not exists incidents_company_user_type_created_idx
  on public.incidents (company_id, user_id, type, created_at desc);

-- Historial -------------------------------------------------------------

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  event_type text not null check (event_type in ('created','status_changed','reopened','comment')),
  from_status public.incident_status,
  to_status public.incident_status,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists incident_events_incident_idx on public.incident_events (incident_id, created_at);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  event_type text not null check (event_type in ('created','status_changed','reassigned','updated')),
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at);

alter table public.incident_events enable row level security;
alter table public.task_events enable row level security;
revoke all on public.incident_events, public.task_events from anon, authenticated;
grant select, insert on public.incident_events to authenticated;
grant select on public.task_events to authenticated;

drop policy if exists incident_events_select on public.incident_events;
create policy incident_events_select on public.incident_events
  for select to authenticated
  using (exists (select 1 from public.incidents i where i.id = incident_events.incident_id));

drop policy if exists incident_events_insert_comment on public.incident_events;
create policy incident_events_insert_comment on public.incident_events
  for insert to authenticated
  with check (
    event_type = 'comment'
    and actor_id = (select auth.uid())
    and exists (select 1 from public.incidents i where i.id = incident_events.incident_id)
  );

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_events.task_id));

create or replace function private.events_fill()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  who text;
begin
  if tg_table_name = 'incident_events' then
    select i.company_id into cid from public.incidents i where i.id = new.incident_id;
    if new.event_type = 'comment' and btrim(coalesce(new.comment, '')) = '' then
      raise exception 'El comentario no puede estar vacío.';
    end if;
  else
    select t.company_id into cid from public.tasks t where t.id = new.task_id;
  end if;
  if cid is null then
    raise exception 'Elemento no encontrado.';
  end if;
  new.company_id := cid;
  if new.actor_id is null then
    new.actor_id := uid;
  end if;
  if new.actor_id is not null then
    select p.full_name into who from public.profiles p where p.id = new.actor_id;
    new.actor_name := who;
  end if;
  return new;
end;
$$;

drop trigger if exists incident_events_fill on public.incident_events;
create trigger incident_events_fill before insert on public.incident_events
  for each row execute function private.events_fill();
drop trigger if exists task_events_fill on public.task_events;
create trigger task_events_fill before insert on public.task_events
  for each row execute function private.events_fill();

-- Reglas de incidencias -------------------------------------------------

create or replace function private.incidents_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_mgr boolean;
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.status := 'open';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.resolved_by := null;
      new.resolved_at := null;
      new.resolution_comment := null;
      new.reopen_count := 0;
    end if;
    return new;
  end if;

  if uid is null then
    return new;
  end if;

  is_mgr := private.has_company_role(old.company_id, array['admin']::public.app_role[])
            or (old.user_id is not null and private.is_manager_for_user(old.company_id, old.user_id));
  if not is_mgr then
    raise exception 'Solo un responsable puede modificar incidencias. Puedes añadir comentarios.';
  end if;

  if new.company_id is distinct from old.company_id
     or new.created_by is distinct from old.created_by
     or new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar la empresa, el autor ni el empleado de una incidencia.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'review' then
      new.reviewed_by := uid;
      new.reviewed_at := now();
      if old.status = 'closed' then
        new.resolved_by := null;
        new.resolved_at := null;
        new.resolution_comment := null;
        new.reopen_count := old.reopen_count + 1;
      end if;
    elsif new.status = 'closed' then
      if btrim(coalesce(new.resolution_comment, '')) = '' then
        raise exception 'Escribe un comentario de resolución para cerrar la incidencia.';
      end if;
      new.resolved_by := uid;
      new.resolved_at := now();
    else
      if old.status = 'closed' then
        new.reopen_count := old.reopen_count + 1;
      end if;
      new.resolved_by := null;
      new.resolved_at := null;
      new.resolution_comment := null;
    end if;
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.resolved_by := old.resolved_by;
    new.resolved_at := old.resolved_at;
    new.resolution_comment := old.resolution_comment;
    new.reopen_count := old.reopen_count;
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_guard on public.incidents;
create trigger incidents_guard before insert or update on public.incidents
  for each row execute function private.incidents_guard();

create or replace function private.incidents_after_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.incident_events (incident_id, actor_id, event_type, to_status)
    values (new.id, coalesce(uid, new.created_by), 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.incident_events (incident_id, actor_id, event_type, from_status, to_status, comment)
    values (
      new.id,
      coalesce(uid, new.resolved_by, new.reviewed_by),
      case when old.status = 'closed' then 'reopened' else 'status_changed' end,
      old.status, new.status,
      case when new.status = 'closed' then new.resolution_comment else null end
    );
  end if;
  return null;
end;
$$;

drop trigger if exists incidents_after_change on public.incidents;
create trigger incidents_after_change after insert or update on public.incidents
  for each row execute function private.incidents_after_change();

-- Reglas de tareas ------------------------------------------------------

create or replace function private.tasks_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_admin boolean;
  is_mgr boolean;
begin
  if tg_op = 'INSERT' then
    new.completed_at := case when new.status = 'completed' then now() else null end;
  else
    if new.status = 'completed' and old.status <> 'completed' then
      new.completed_at := now();
    elsif new.status <> 'completed' then
      new.completed_at := null;
    else
      new.completed_at := old.completed_at;
    end if;
  end if;

  if uid is null then
    return new;
  end if;

  if new.assigned_to is not null then
    if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
      if not exists (
        select 1 from public.company_memberships cm
         where cm.company_id = new.company_id and cm.user_id = new.assigned_to and cm.status = 'active'
      ) then
        raise exception 'El empleado asignado no pertenece a la empresa o está desactivado.';
      end if;
    end if;
  end if;

  is_admin := private.has_company_role(new.company_id, array['admin']::public.app_role[]);

  if tg_op = 'INSERT' then
    if not is_admin and new.assigned_to is not null
       and not exists (select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = new.assigned_to) then
      raise exception 'El empleado no pertenece al equipo de la tarea.';
    end if;
    return new;
  end if;

  is_mgr := is_admin or (old.team_id is not null and private.is_team_manager(old.team_id));
  if not is_mgr then
    if new.company_id is distinct from old.company_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.assigned_to is distinct from old.assigned_to
       or new.team_id is distinct from old.team_id
       or new.priority is distinct from old.priority
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by then
      raise exception 'Solo puedes cambiar el estado de tus tareas.';
    end if;
    if new.status is distinct from old.status and (new.status = 'cancelled' or old.status = 'cancelled') then
      raise exception 'Solo un responsable puede cancelar o reactivar una tarea.';
    end if;
  elsif not is_admin and new.assigned_to is not null
        and new.assigned_to is distinct from old.assigned_to
        and not exists (select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = new.assigned_to) then
    raise exception 'El empleado no pertenece al equipo de la tarea.';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function private.tasks_guard();

update public.tasks set completed_at = updated_at where status = 'completed' and completed_at is null;

create or replace function private.tasks_after_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  actor uuid;
  changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, actor_id, event_type, to_status, detail)
    values (new.id, coalesce(uid, new.created_by), 'created', new.status::text,
            jsonb_build_object('title', new.title,
              'to_name', (select p.full_name from public.profiles p where p.id = new.assigned_to)));
    return null;
  end if;

  actor := uid;
  if new.status is distinct from old.status then
    insert into public.task_events (task_id, actor_id, event_type, from_status, to_status)
    values (new.id, actor, 'status_changed', old.status::text, new.status::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_events (task_id, actor_id, event_type, detail)
    values (new.id, actor, 'reassigned', jsonb_build_object(
      'from_name', (select p.full_name from public.profiles p where p.id = old.assigned_to),
      'to_name', (select p.full_name from public.profiles p where p.id = new.assigned_to)));
  end if;
  if new.title is distinct from old.title then
    changes := changes || jsonb_build_object('title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.priority is distinct from old.priority then
    changes := changes || jsonb_build_object('priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.due_at is distinct from old.due_at then
    changes := changes || jsonb_build_object('due_at', jsonb_build_object('from', old.due_at, 'to', new.due_at));
  end if;
  if new.description is distinct from old.description then
    changes := changes || jsonb_build_object('description', jsonb_build_object('changed', true));
  end if;
  if changes <> '{}'::jsonb then
    insert into public.task_events (task_id, actor_id, event_type, detail)
    values (new.id, actor, 'updated', changes);
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_after_change on public.tasks;
create trigger tasks_after_change after insert or update on public.tasks
  for each row execute function private.tasks_after_change();

-- Auditoría ---------------------------------------------------------------

create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec record;
  j jsonb;
  cid uuid;
  eid uuid;
  target uuid;
  tname text;
  aname text;
  meta jsonb;
  diff jsonb;
begin
  if uid is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    rec := old;
  else
    rec := new;
  end if;
  j := to_jsonb(rec);

  cid := nullif(j ->> 'company_id', '')::uuid;
  if cid is null and tg_table_name = 'team_members' then
    select t.company_id into cid from public.teams t where t.id = (j ->> 'team_id')::uuid;
  end if;
  if cid is null and tg_table_name = 'companies' then
    cid := (j ->> 'id')::uuid;
  end if;
  if cid is null then
    return null;
  end if;

  if tg_table_name = 'company_settings' then
    eid := (j ->> 'company_id')::uuid;
  elsif tg_table_name = 'team_members' then
    eid := (j ->> 'team_id')::uuid;
  else
    eid := (j ->> 'id')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'logo_data');
    if diff is null then
      return null;
    end if;
  end if;

  target := coalesce(nullif(j ->> 'user_id', '')::uuid, nullif(j ->> 'assigned_to', '')::uuid);
  if target is not null then
    select p.full_name into tname from public.profiles p where p.id = target;
  end if;
  select p.full_name into aname from public.profiles p where p.id = uid;

  meta := jsonb_strip_nulls(jsonb_build_object(
    'title', j ->> 'title',
    'name', j ->> 'name',
    'type', j ->> 'type',
    'role', j ->> 'role',
    'status', j ->> 'status',
    'target', tname,
    'actor_name', aname
  ));
  if diff is not null then
    meta := meta || jsonb_build_object('changes', diff);
  end if;

  insert into public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  values (cid, uid, tg_table_name || '.' || lower(tg_op), tg_table_name, eid, meta);
  return null;
end;
$$;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('companies',           'update'),
      ('company_settings',    'insert or update'),
      ('company_memberships', 'insert or update or delete'),
      ('teams',               'insert or update or delete'),
      ('team_members',        'insert or delete'),
      ('geofences',           'insert or update or delete'),
      ('tasks',               'insert or update or delete'),
      ('incidents',           'insert or update'),
      ('time_entries',        'insert or update')
    ) as v(tbl, ops)
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', spec.tbl);
    execute format(
      'create trigger audit_%1$s after %2$s on public.%1$I for each row execute function private.audit_row()',
      spec.tbl, spec.ops);
  end loop;
end $$;

-- El administrador puede consultar el historial; nadie puede escribirlo desde el navegador.
drop policy if exists audit_logs_select_manager on public.audit_logs;
drop policy if exists audit_logs_insert_actor on public.audit_logs;
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (private.has_company_role(company_id, array['admin']::public.app_role[]));

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create index if not exists audit_logs_company_entity_created_idx
  on public.audit_logs (company_id, entity_type, created_at desc);