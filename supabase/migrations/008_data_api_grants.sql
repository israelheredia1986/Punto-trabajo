-- Punto Trabajo · explicit Data API grants
-- RLS controls rows; these grants control which roles can call each table.
-- Keep privileged tables inaccessible from the browser unless the app needs them.

revoke all on table public.companies,
  public.profiles,
  public.company_memberships,
  public.teams,
  public.team_members,
  public.geofences,
  public.time_entries,
  public.location_events,
  public.tasks,
  public.incidents,
  public.audit_logs,
  public.time_entry_breaks
from anon;

revoke all on table public.companies,
  public.profiles,
  public.company_memberships,
  public.teams,
  public.team_members,
  public.geofences,
  public.time_entries,
  public.location_events,
  public.tasks,
  public.incidents,
  public.audit_logs,
  public.time_entry_breaks
from authenticated;

grant select, insert, update on table public.companies to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.company_memberships to authenticated;
grant select, insert, update, delete on table public.teams to authenticated;
grant select, insert, update, delete on table public.team_members to authenticated;
grant select, insert, update, delete on table public.geofences to authenticated;
grant select, insert, update on table public.time_entries to authenticated;
grant select, insert on table public.location_events to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update on table public.incidents to authenticated;
grant select, insert, update on table public.time_entry_breaks to authenticated;

-- Audit logs are intended for privileged/server-side access and are not exposed to the browser.
revoke all on table public.audit_logs from authenticated, anon;

-- Make sure the exposed operational tables remain protected by RLS.
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.geofences enable row level security;
alter table public.time_entries enable row level security;
alter table public.location_events enable row level security;
alter table public.tasks enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.time_entry_breaks enable row level security;
