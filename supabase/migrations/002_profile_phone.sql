-- Adds the phone number collected at sign-up. Run once in the Supabase SQL editor.

alter table public.profiles add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'role', 'fan');
begin
  if wanted not in ('fan', 'promoter') then
    wanted := 'fan';
  end if;
  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone', wanted)
  on conflict (id) do nothing;
  return new;
end;
$$;
