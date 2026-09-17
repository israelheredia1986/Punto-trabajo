-- Punto Trabajo · operations RLS hardening
-- Depends on 001_initial_schema.sql + 002_harden_team_rls.sql.
-- Adds the explicit incident insert policy used by the operational UI.

revoke all on public.incidents from anon;
grant select, insert, update on public.incidents to authenticated;

drop policy if exists incidents_insert_scope on public.incidents;
create policy incidents_insert_scope on public.incidents
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    user_id = (select auth.uid())
    or private.has_company_role(company_id, array['admin']::public.app_role[])
    or (
      user_id is not null
      and private.is_manager_for_user(company_id, user_id)
    )
  )
);

-- Keep resolved metadata owned by the actor making the state transition.
drop policy if exists incidents_update_manager_or_owner on public.incidents;
create policy incidents_update_manager_or_owner on public.incidents
for update to authenticated
using (
  created_by = (select auth.uid())
  or user_id = (select auth.uid())
  or private.is_manager_for_user(company_id, user_id)
)
with check (
  created_by = (select auth.uid())
  or user_id = (select auth.uid())
  or private.is_manager_for_user(company_id, user_id)
);

-- Helpful indexes for the operational views.
create index if not exists incidents_company_user_created_idx
  on public.incidents(company_id, user_id, created_at desc);

create index if not exists time_entries_company_started_idx
  on public.time_entries(company_id, started_at desc);

create index if not exists tasks_company_assignee_due_idx
  on public.tasks(company_id, assigned_to, due_at);
