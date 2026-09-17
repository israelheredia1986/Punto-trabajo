-- Punto Trabajo · geofencing/live-location support
-- Depends on 001_initial_schema.sql, 002_harden_team_rls.sql and 003_time_entry_breaks.sql.

create index if not exists geofences_company_active_idx
  on public.geofences(company_id, active);

create index if not exists location_events_company_recorded_idx
  on public.location_events(company_id, recorded_at desc);

create index if not exists location_events_company_user_recorded_idx
  on public.location_events(company_id, user_id, recorded_at desc);

-- location_events already uses RLS from the initial schema/hardening migration.
-- Employees can insert their own device positions; managers can read positions
-- for users in their authorized scope.
