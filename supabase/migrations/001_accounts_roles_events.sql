-- Siyangena: accounts, roles, promoter applications, events, wallets and backend state.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- Who can do what:
--   fan       buys tickets, sets agent limits, resells. Every new account starts here.
--   promoter  applies, and once an admin approves, creates and runs events.
--   admin     reviews promoter applications. Never set from the app: see the bottom of this file.
--
-- The backend talks to these tables with the service role key, which bypasses RLS.
-- The RLS policies below only matter for anything that reads with the anon key.

-- ---------- Profiles ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'fan' check (role in ('fan', 'promoter', 'admin')),
  verified boolean not null default false,
  wallet_address text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);

-- New sign-ups get a profile. The role from sign-up metadata can only be fan or promoter;
-- a promoter still has to be approved before their events can go on sale.
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
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', wanted)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Promoter applications ----------

create table if not exists public.promoter_applications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('business', 'independent')),
  display_name text not null,
  registration_number text,
  past_events text,
  socials text,
  payout_details text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'needs_more', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promoter_applications enable row level security;

drop policy if exists "Read own application" on public.promoter_applications;
create policy "Read own application" on public.promoter_applications
  for select using (auth.uid() = user_id);

-- ---------- Events ----------

create table if not exists public.events (
  id text primary key,
  promoter_id uuid references public.profiles (id) on delete set null,
  promoter_name text,
  name text not null,
  venue text not null,
  city text,
  scene text,
  poster_url text,
  starts_at timestamptz not null,
  price_zar numeric not null,
  supply integer not null,
  sold integer not null default 0,
  max_per_fan integer not null,
  resale_cap_zar numeric not null,
  resale_fee_pct numeric not null default 5,
  state text not null default 'scheduled' check (state in ('scheduled', 'open', 'sold_out', 'closed', 'cancelled')),
  issuance_id text,
  issuance_tx text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_promoter_idx on public.events (promoter_id);

alter table public.events enable row level security;

-- Anyone can browse events.
drop policy if exists "Events are public" on public.events;
create policy "Events are public" on public.events
  for select using (true);

-- ---------- Wallets (server only) ----------
-- One ticket wallet per account, created by the backend on Testnet.
-- The seed is encrypted with WALLET_ENCRYPTION_KEY before it gets here.
-- RLS is on with no policies, so only the service role can read this table.

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  address text not null unique,
  seed_encrypted text not null,
  network text not null,
  created_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

-- ---------- Backend working state (server only) ----------
-- Sale intents, resale listings and Batches, agent limits, history and the live feed.
-- The backend keeps these in memory and saves a snapshot here, so a restart loses nothing.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- ---------- Making someone an admin ----------
-- Sign up in the app first, then run this with their email:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
