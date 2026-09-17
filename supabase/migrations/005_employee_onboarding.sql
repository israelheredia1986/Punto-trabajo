-- Punto Trabajo · employee onboarding
-- Depends on 001_initial_schema.sql and 002_harden_team_rls.sql.
-- Creates profiles automatically for new Auth users and activates invited memberships on first login.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,full_name,phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(coalesce(new.email,''),'@',1),''),
      'Usuario'
    ),
    new.raw_user_meta_data->>'phone'
  )
  on conflict(id) do update
    set full_name=excluded.full_name,
        phone=coalesce(excluded.phone, public.profiles.phone),
        updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.activate_my_membership()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  changed integer;
begin
  update public.company_memberships
  set status='active', updated_at=now()
  where user_id=(select auth.uid())
    and status='invited';

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.activate_my_membership() from public,anon;
grant execute on function public.activate_my_membership() to authenticated;

-- A newly invited user may resolve their own invited membership while the account is being completed.
drop policy if exists memberships_select_scope on public.company_memberships;
create policy memberships_select_scope on public.company_memberships
for select to authenticated
using(
  user_id=(select auth.uid())
  or private.has_company_role(company_id,array['admin']::public.app_role[])
  or private.is_manager_for_user(company_id,user_id)
);
