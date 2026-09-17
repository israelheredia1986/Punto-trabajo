-- Punto Trabajo · pause/break tracking
-- Depends on 001_initial_schema.sql and 002_harden_team_rls.sql.

create table if not exists public.time_entry_breaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists time_entry_one_open_break
  on public.time_entry_breaks(time_entry_id)
  where ended_at is null;

create index if not exists time_entry_breaks_user_idx
  on public.time_entry_breaks(company_id,user_id,started_at desc);

alter table public.time_entry_breaks enable row level security;

revoke all on public.time_entry_breaks from anon;
grant select,insert,update on public.time_entry_breaks to authenticated;

drop policy if exists time_entry_breaks_select_scope on public.time_entry_breaks;
create policy time_entry_breaks_select_scope on public.time_entry_breaks
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists time_entry_breaks_insert_scope on public.time_entry_breaks;
create policy time_entry_breaks_insert_scope on public.time_entry_breaks
for insert to authenticated
with check (
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop policy if exists time_entry_breaks_update_scope on public.time_entry_breaks;
create policy time_entry_breaks_update_scope on public.time_entry_breaks
for update to authenticated
using (
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
)
with check (
  user_id=(select auth.uid())
  or private.is_manager_for_user(company_id,user_id)
);

drop trigger if exists set_updated_at_time_entry_breaks on public.time_entry_breaks;
create trigger set_updated_at_time_entry_breaks
before update on public.time_entry_breaks
for each row execute function public.set_updated_at();
