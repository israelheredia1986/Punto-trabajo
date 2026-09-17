-- Punto Trabajo · RLS hardening
-- Depends on 001_initial_schema.sql.
-- Ensures employees see only themselves and supervisors see only their assigned teams.

create or replace function private.is_team_manager(p_team_id uuid)
returns boolean
language sql
security definer
set search_path=''
stable
as $$
  select exists (
    select 1 from public.teams t
    where t.id=p_team_id
      and (
        private.has_company_role(t.company_id,array['admin']::public.app_role[])
        or (
          t.supervisor_id=(select auth.uid())
          and private.has_company_role(t.company_id,array['supervisor']::public.app_role[])
        )
      )
  );
$$;

create or replace function private.is_manager_for_user(p_company_id uuid,p_user_id uuid)
returns boolean
language sql
security definer
set search_path=''
stable
as $$
  select private.has_company_role(p_company_id,array['admin']::public.app_role[])
  or exists (
    select 1
    from public.teams t
    join public.team_members tm on tm.team_id=t.id
    where t.company_id=p_company_id
      and tm.user_id=p_user_id
      and t.supervisor_id=(select auth.uid())
      and private.has_company_role(p_company_id,array['supervisor']::public.app_role[])
  );
$$;

revoke all on function private.is_team_manager(uuid) from public;
revoke all on function private.is_manager_for_user(uuid,uuid) from public;
grant execute on function private.is_team_manager(uuid) to authenticated;
grant execute on function private.is_manager_for_user(uuid,uuid) to authenticated;

-- Creator of a company becomes its first admin automatically.
create or replace function public.bootstrap_company_membership()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,full_name)
  values (
    new.created_by,
    coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id=new.created_by),
      split_part((select email from auth.users where id=new.created_by),'@',1),
      'Usuario'
    )
  )
  on conflict(id) do nothing;

  insert into public.company_memberships(company_id,user_id,role,status)
  values(new.id,new.created_by,'admin','active')
  on conflict(company_id,user_id) do update set role='admin',status='active';

  return new;
end;
$$;

drop trigger if exists bootstrap_company_membership on public.companies;
create trigger bootstrap_company_membership
  after insert on public.companies
  for each row execute function public.bootstrap_company_membership();
revoke execute on function public.bootstrap_company_membership() from public,anon,authenticated;

-- Profiles: own profile for employees; admin sees company; supervisor sees assigned team.
drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
for select to authenticated
using (
  id=(select auth.uid())
  or exists (
    select 1 from public.company_memberships cm
    where cm.user_id=(select auth.uid())
      and cm.status='active'
      and cm.role='admin'
      and exists (
        select 1 from public.company_memberships target
        where target.user_id=public.profiles.id
          and target.company_id=cm.company_id
          and target.status='active'
      )
  )
  or exists (
    select 1 from public.company_memberships target
    where target.user_id=public.profiles.id
      and target.status='active'
      and private.is_manager_for_user(target.company_id,target.user_id)
  )
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
drop policy if exists profiles_update_self_only on public.profiles;
create policy profiles_update_self_only on public.profiles
for update to authenticated
using(id=(select auth.uid()))
with check(id=(select auth.uid()));

-- Memberships: employee sees own membership; admin sees company; supervisor sees assigned team members.
drop policy if exists memberships_select_scope on public.company_memberships;
create policy memberships_select_scope on public.company_memberships
for select to authenticated
using(
  user_id=(select auth.uid())
  or private.has_company_role(company_id,array['admin']::public.app_role[])
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists memberships_insert_admin_or_self on public.company_memberships;
drop policy if exists memberships_insert_admin on public.company_memberships;
create policy memberships_insert_admin on public.company_memberships
for insert to authenticated
with check(private.has_company_role(company_id,array['admin']::public.app_role[]));

-- Teams: supervisors can only manage teams where they are the supervisor.
drop policy if exists teams_write_admin_supervisor on public.teams;
create policy teams_write_admin_supervisor on public.teams
for all to authenticated
using(
  private.has_company_role(company_id,array['admin']::public.app_role[])
  or (
    supervisor_id=(select auth.uid())
    and private.has_company_role(company_id,array['supervisor']::public.app_role[])
  )
)
with check(
  private.has_company_role(company_id,array['admin']::public.app_role[])
  or (
    supervisor_id=(select auth.uid())
    and private.has_company_role(company_id,array['supervisor']::public.app_role[])
  )
);

-- Team membership: admin or that team's supervisor.
drop policy if exists team_members_write_admin_supervisor on public.team_members;
create policy team_members_write_admin_supervisor on public.team_members
for all to authenticated
using(private.is_team_manager(team_id))
with check(private.is_team_manager(team_id));

-- Geofences: only administrators can configure company zones.
drop policy if exists geofences_write_admin_supervisor on public.geofences;
create policy geofences_write_admin on public.geofences
for all to authenticated
using(private.has_company_role(company_id,array['admin']::public.app_role[]))
with check(private.has_company_role(company_id,array['admin']::public.app_role[]));

-- Time entries: administrators see company; supervisors see only their own team; employees see themselves.
drop policy if exists time_entries_select_scope on public.time_entries;
create policy time_entries_select_scope on public.time_entries
for select to authenticated
using(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists time_entries_insert_scope on public.time_entries;
create policy time_entries_insert_scope on public.time_entries
for insert to authenticated
with check(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists time_entries_update_scope on public.time_entries;
create policy time_entries_update_scope on public.time_entries
for update to authenticated
using(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
)
with check(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

-- Locations: same scope as time entries.
drop policy if exists location_events_select_scope on public.location_events;
create policy location_events_select_scope on public.location_events
for select to authenticated
using(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

-- Tasks: assigned employee sees own; supervisor manages only tasks for their teams; admin manages company.
drop policy if exists tasks_select_scope on public.tasks;
create policy tasks_select_scope on public.tasks
for select to authenticated
using(
  assigned_to=(select auth.uid())
  or private.has_company_role(company_id,array['admin']::public.app_role[])
  or (team_id is not null and private.is_team_manager(team_id))
);

drop policy if exists tasks_insert_manager on public.tasks;
create policy tasks_insert_manager on public.tasks
for insert to authenticated
with check(
  created_by=(select auth.uid())
  and (
    private.has_company_role(company_id,array['admin']::public.app_role[])
    or (team_id is not null and private.is_team_manager(team_id))
  )
);

drop policy if exists tasks_update_scope on public.tasks;
create policy tasks_update_scope on public.tasks
for update to authenticated
using(
  assigned_to=(select auth.uid())
  or private.has_company_role(company_id,array['admin']::public.app_role[])
  or (team_id is not null and private.is_team_manager(team_id))
)
with check(
  assigned_to=(select auth.uid())
  or private.has_company_role(company_id,array['admin']::public.app_role[])
  or (team_id is not null and private.is_team_manager(team_id))
);

drop policy if exists tasks_delete_manager on public.tasks;
create policy tasks_delete_manager on public.tasks
for delete to authenticated
using(
  private.has_company_role(company_id,array['admin']::public.app_role[])
  or (team_id is not null and private.is_team_manager(team_id))
);

-- Incidents: own for employees; team-scoped for supervisors; company-wide for admin.
drop policy if exists incidents_select_scope on public.incidents;
create policy incidents_select_scope on public.incidents
for select to authenticated
using(
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists incidents_update_manager_or_owner on public.incidents;
create policy incidents_update_manager_or_owner on public.incidents
for update to authenticated
using(
  created_by=(select auth.uid())
  or user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
)
with check(
  created_by=(select auth.uid())
  or user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

-- Company creation remains self-only, and its trigger grants the creator admin membership.
