-- Punto Trabajo · security hardening for trigger/helper functions
-- Fixes mutable search_path and intentionally keeps membership activation callable by authenticated users.

alter function public.set_updated_at()
  set search_path = pg_catalog;

alter function public.activate_my_membership()
  set search_path = '';

revoke execute on function public.activate_my_membership() from anon;
grant execute on function public.activate_my_membership() to authenticated;
