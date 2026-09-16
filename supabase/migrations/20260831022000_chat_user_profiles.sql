-- User profiles for Chat Interno presence & display
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Anyone authenticated can read profiles (needed to show names/avatars)
create policy "Authenticated users can view all profiles"
  on public.user_profiles for select
  using (auth.uid() is not null);

-- Users can only insert their own profile
create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

-- Users can only update their own profile
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Function to auto-create profile on signup
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nome',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Usuário'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger on auth.users insert
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill existing users who don't have a profile yet
insert into public.user_profiles (id, display_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'nome',
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1),
    'Usuário'
  )
from auth.users u
where not exists (
  select 1 from public.user_profiles p where p.id = u.id
);

-- Index for fast lookups
create index if not exists idx_user_profiles_display_name on public.user_profiles(display_name);
