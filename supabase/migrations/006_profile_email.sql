-- Punto Trabajo · profile email for employee administration
-- Depends on 005_employee_onboarding.sql.

alter table public.profiles
  add column if not exists email text;

create index if not exists profiles_email_idx on public.profiles(email);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,full_name,email,phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(coalesce(new.email,''),'@',1),''),
      'Usuario'
    ),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict(id) do update
    set full_name=excluded.full_name,
        email=excluded.email,
        phone=coalesce(excluded.phone, public.profiles.phone),
        updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
