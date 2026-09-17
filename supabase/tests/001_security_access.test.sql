begin;
select plan(24);

select ok((select relrowsecurity from pg_class where oid='public.companies'::regclass), 'companies has RLS');
select ok((select relrowsecurity from pg_class where oid='public.profiles'::regclass), 'profiles has RLS');
select ok((select relrowsecurity from pg_class where oid='public.company_memberships'::regclass), 'company_memberships has RLS');
select ok((select relrowsecurity from pg_class where oid='public.teams'::regclass), 'teams has RLS');
select ok((select relrowsecurity from pg_class where oid='public.team_members'::regclass), 'team_members has RLS');
select ok((select relrowsecurity from pg_class where oid='public.geofences'::regclass), 'geofences has RLS');
select ok((select relrowsecurity from pg_class where oid='public.time_entries'::regclass), 'time_entries has RLS');
select ok((select relrowsecurity from pg_class where oid='public.location_events'::regclass), 'location_events has RLS');
select ok((select relrowsecurity from pg_class where oid='public.tasks'::regclass), 'tasks has RLS');
select ok((select relrowsecurity from pg_class where oid='public.incidents'::regclass), 'incidents has RLS');
select ok((select relrowsecurity from pg_class where oid='public.audit_logs'::regclass), 'audit_logs has RLS');
select ok((select relrowsecurity from pg_class where oid='public.time_entry_breaks'::regclass), 'time_entry_breaks has RLS');

select ok(not has_table_privilege('anon','public.companies','select'), 'anon cannot select companies');
select ok(not has_table_privilege('anon','public.profiles','select'), 'anon cannot select profiles');
select ok(not has_table_privilege('anon','public.company_memberships','select'), 'anon cannot select memberships');
select ok(not has_table_privilege('anon','public.teams','select'), 'anon cannot select teams');
select ok(not has_table_privilege('anon','public.team_members','select'), 'anon cannot select team members');
select ok(not has_table_privilege('anon','public.geofences','select'), 'anon cannot select geofences');
select ok(not has_table_privilege('anon','public.time_entries','select'), 'anon cannot select time entries');
select ok(not has_table_privilege('anon','public.location_events','select'), 'anon cannot select locations');
select ok(not has_table_privilege('anon','public.tasks','select'), 'anon cannot select tasks');
select ok(not has_table_privilege('anon','public.incidents','select'), 'anon cannot select incidents');
select ok(not has_table_privilege('anon','public.audit_logs','select'), 'anon cannot select audit logs');
select ok(not has_table_privilege('anon','public.time_entry_breaks','select'), 'anon cannot select breaks');

select * from finish();
rollback;
