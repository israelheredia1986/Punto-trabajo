-- Punto Trabajo · keep membership activation privileged code outside exposed API
-- The browser-facing RPC stays SECURITY INVOKER; the actual update lives in private.

create or replace function private.activate_my_membership()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  changed integer;
begin
  if (select auth.uid()) is null then
    return 0;
  end if;

  update public.company_memberships
  set status='active', updated_at=now()
  where user_id=(select auth.uid())
    and status='invited';

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function private.activate_my_membership() from public, anon;
grant execute on function private.activate_my_membership() to authenticated;

create or replace function public.activate_my_membership()
returns integer
language sql
security invoker
set search_path=''
as $$
  select private.activate_my_membership();
$$;

revoke all on function public.activate_my_membership() from public, anon;
grant execute on function public.activate_my_membership() to authenticated;
