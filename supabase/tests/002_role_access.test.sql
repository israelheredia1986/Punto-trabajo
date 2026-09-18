-- Punto Trabajo · real role/RLS smoke test
-- Run with a privileged database connection. All test data is rolled back.
-- Verifies Admin / Supervisor / Employee isolation against actual Supabase RLS.

begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
('11111111-1111-1111-1111-111111111111','authenticated','authenticated','security-admin@test.local',now(),now(),now(),'{}','{"full_name":"Security Admin"}',false,false),
('22222222-2222-2222-2222-222222222222','authenticated','authenticated','security-supervisor@test.local',now(),now(),now(),'{}','{"full_name":"Security Supervisor"}',false,false),
('33333333-3333-3333-3333-333333333333','authenticated','authenticated','security-employee-a@test.local',now(),now(),now(),'{}','{"full_name":"Security Employee A"}',false,false),
('44444444-4444-4444-4444-444444444444','authenticated','authenticated','security-employee-b@test.local',now(),now(),now(),'{}','{"full_name":"Security Employee B"}',false,false),
('55555555-5555-5555-5555-555555555555','authenticated','authenticated','security-other-admin@test.local',now(),now(),now(),'{}','{"full_name":"Other Company Admin"}',false,false);

insert into public.companies (id,name,created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Security Test Company','11111111-1111-1111-1111-111111111111');

insert into public.profiles(id,full_name,email) values
('55555555-5555-5555-5555-555555555555','Other Company Admin','security-other-admin@test.local'),('22222222-2222-2222-2222-222222222222','Security Supervisor','security-supervisor@test.local'),
('33333333-3333-3333-3333-333333333333','Security Employee A','security-employee-a@test.local'),
('44444444-4444-4444-4444-444444444444','Security Employee B','security-employee-b@test.local')
on conflict(id) do update set full_name=excluded.full_name,email=excluded.email;

insert into public.companies (id,name,created_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc','Other Security Company','55555555-5555-5555-5555-555555555555');

insert into public.company_memberships(company_id,user_id,role,status,job_title) values
('cccccccc-cccc-cccc-cccc-cccccccccccc','55555555-5555-5555-5555-555555555555','admin','active','Other Admin'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','supervisor','active','Supervisor'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','employee','active','Empleado A'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','employee','active','Empleado B');

insert into public.teams(id,company_id,name,supervisor_id) values
('aaaaaaaa-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Equipo A','22222222-2222-2222-2222-222222222222'),
('bbbbbbbb-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Equipo B',null);

insert into public.team_members(team_id,user_id) values
('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333'),
('bbbbbbbb-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444');

insert into public.tasks(id,company_id,title,assigned_to,team_id,created_by) values
('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Task A','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Task B','44444444-4444-4444-4444-444444444444','bbbbbbbb-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111');

insert into public.time_entries(id,company_id,user_id,started_at,status) values
('aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333',now(),'open'),
('bbbb0004-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444',now(),'open');

insert into public.geofences(id,company_id,name,latitude,longitude,radius_m)
values ('aaaa0005-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Zona test',36,-5,100);

insert into public.tasks(id,company_id,title,assigned_to,team_id,created_by)
values ('cccc0006-cccc-cccc-cccc-cccccccccccc','cccccccc-cccc-cccc-cccc-cccccccccccc','Other Company Task','55555555-5555-5555-5555-555555555555',null,'55555555-5555-5555-5555-555555555555');

create temp table security_results (
  role_name text not null,
  test text not null,
  expected text not null,
  observed text not null,
  pass boolean not null
);
grant insert,select on security_results to authenticated;

set local role authenticated;

-- Administrator: company-wide operational visibility.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into security_results
select 'admin','sees all memberships','4',count(*)::text,count(*)=4 from public.company_memberships where company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'admin','sees all tasks','2',count(*)::text,count(*)=2 from public.tasks where company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'admin','sees all time entries','2',count(*)::text,count(*)=2 from public.time_entries where company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'admin','cannot see other company task','0',count(*)::text,count(*)=0 from public.tasks where id='cccc0006-cccc-cccc-cccc-cccccccccccc';
insert into security_results
select 'admin','cannot see other company membership','0',count(*)::text,count(*)=0 from public.company_memberships where company_id='cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Supervisor: only users/tasks/time entries belonging to supervised team.
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
insert into security_results
select 'supervisor','sees team A employee','1',count(*)::text,count(*)=1 from public.profiles where id='33333333-3333-3333-3333-333333333333';
insert into security_results
select 'supervisor','cannot see team B employee','0',count(*)::text,count(*)=0 from public.profiles where id='44444444-4444-4444-4444-444444444444';
insert into security_results
select 'supervisor','sees team A task','1',count(*)::text,count(*)=1 from public.tasks where id='aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'supervisor','cannot see team B task','0',count(*)::text,count(*)=0 from public.tasks where id='bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
insert into security_results
select 'supervisor','sees team A time entry','1',count(*)::text,count(*)=1 from public.time_entries where id='aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'supervisor','cannot see team B time entry','0',count(*)::text,count(*)=0 from public.time_entries where id='bbbb0004-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Employee: self-only visibility.
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
insert into security_results
select 'employee','sees own profile','1',count(*)::text,count(*)=1 from public.profiles where id='33333333-3333-3333-3333-333333333333';
insert into security_results
select 'employee','cannot see other employee profile','0',count(*)::text,count(*)=0 from public.profiles where id='44444444-4444-4444-4444-444444444444';
insert into security_results
select 'employee','sees own task','1',count(*)::text,count(*)=1 from public.tasks where id='aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'employee','cannot see other employee task','0',count(*)::text,count(*)=0 from public.tasks where id='bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
insert into security_results
select 'employee','sees own time entry','1',count(*)::text,count(*)=1 from public.time_entries where id='aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into security_results
select 'employee','cannot see other time entry','0',count(*)::text,count(*)=0 from public.time_entries where id='bbbb0004-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Forbidden writes: employee cannot create geofences or tasks.
do $$
begin
  begin
    insert into public.geofences(company_id,name,latitude,longitude,radius_m)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Employee geofence',36,-5,100);
    insert into security_results values('employee','cannot create geofence','BLOCKED','insert succeeded',false);
  exception when others then
    insert into security_results values('employee','cannot create geofence','BLOCKED','blocked',true);
  end;

  begin
    insert into public.tasks(company_id,title,assigned_to,created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Employee task','33333333-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333');
    insert into security_results values('employee','cannot create task','BLOCKED','insert succeeded',false);
  exception when others then
    insert into security_results values('employee','cannot create task','BLOCKED','blocked',true);
  end;
end $$;

-- Supervisor cannot configure company geofences.
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into public.geofences(company_id,name,latitude,longitude,radius_m)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Supervisor geofence',36,-5,100);
    insert into security_results values('supervisor','cannot create geofence','BLOCKED','insert succeeded',false);
  exception when others then
    insert into security_results values('supervisor','cannot create geofence','BLOCKED','blocked',true);
  end;
end $$;

-- Any failed assertion aborts the test; successful run prints all checks.
do $$
begin
  if exists (select 1 from security_results where not pass) then
    raise exception 'RLS security test failed: %', (
      select string_agg(role_name || ' / ' || test || ' -> ' || observed, '; ')
      from security_results where not pass
    );
  end if;
end $$;

select * from security_results order by role_name, test;

rollback;
