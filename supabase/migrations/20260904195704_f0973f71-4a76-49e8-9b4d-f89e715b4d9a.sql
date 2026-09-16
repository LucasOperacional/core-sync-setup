create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conversations_user_id on public.ai_conversations(user_id);
create index if not exists idx_ai_conversations_updated on public.ai_conversations(updated_at desc);
alter table public.ai_conversations enable row level security;
create policy "Users can view own conversations" on public.ai_conversations for select using (auth.uid() = user_id);
create policy "Users can insert own conversations" on public.ai_conversations for insert with check (auth.uid() = user_id);
create policy "Users can update own conversations" on public.ai_conversations for update using (auth.uid() = user_id);
create policy "Users can delete own conversations" on public.ai_conversations for delete using (auth.uid() = user_id);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider text,
  model text,
  status text not null default 'sent' check (status in ('sent', 'streaming', 'done', 'error')),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_conversation on public.ai_messages(conversation_id, created_at);
create index if not exists idx_ai_messages_user_id on public.ai_messages(user_id);
alter table public.ai_messages enable row level security;
create policy "Users can view own messages" on public.ai_messages for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on public.ai_messages for insert with check (auth.uid() = user_id);
create policy "Users can update own messages" on public.ai_messages for update using (auth.uid() = user_id);
create policy "Users can delete own messages" on public.ai_messages for delete using (auth.uid() = user_id);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'group' check (type in ('group', 'private')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chat_rooms enable row level security;

create table if not exists public.chat_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);
create index if not exists idx_chat_room_members_room on public.chat_room_members(room_id);
create index if not exists idx_chat_room_members_user on public.chat_room_members(user_id);
alter table public.chat_room_members enable row level security;
alter table public.chat_room_members replica identity full;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  attachment_url text,
  attachment_name text,
  attachment_type text,
  edited boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_room on public.chat_messages(room_id, created_at);
create index if not exists idx_chat_messages_user on public.chat_messages(user_id);
alter table public.chat_messages enable row level security;
alter table public.chat_messages replica identity full;

create table if not exists public.chat_message_reads (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique(room_id, user_id)
);
create index if not exists idx_chat_reads_room_user on public.chat_message_reads(room_id, user_id);
alter table public.chat_message_reads enable row level security;

create policy "Users can view rooms they belong to" on public.chat_rooms for select
  using (exists (select 1 from public.chat_room_members where chat_room_members.room_id = chat_rooms.id and chat_room_members.user_id = auth.uid()));
create policy "Authenticated users can create rooms" on public.chat_rooms for insert with check (auth.uid() is not null);
create policy "Room admins can update rooms" on public.chat_rooms for update
  using (exists (select 1 from public.chat_room_members where chat_room_members.room_id = chat_rooms.id and chat_room_members.user_id = auth.uid() and chat_room_members.role = 'admin'));

create policy "Members can view room members" on public.chat_room_members for select
  using (exists (select 1 from public.chat_room_members as m where m.room_id = chat_room_members.room_id and m.user_id = auth.uid()));
create policy "Authenticated users can insert members" on public.chat_room_members for insert with check (auth.uid() is not null);
create policy "Members can remove themselves" on public.chat_room_members for delete using (user_id = auth.uid());

create policy "Members can view room messages" on public.chat_messages for select
  using (exists (select 1 from public.chat_room_members where chat_room_members.room_id = chat_messages.room_id and chat_room_members.user_id = auth.uid()));
create policy "Members can insert messages" on public.chat_messages for insert
  with check (auth.uid() = user_id and exists (select 1 from public.chat_room_members where chat_room_members.room_id = chat_messages.room_id and chat_room_members.user_id = auth.uid()));
create policy "Users can update own messages" on public.chat_messages for update using (auth.uid() = user_id);
create policy "Users can delete own messages" on public.chat_messages for delete using (auth.uid() = user_id);

create policy "Users can view own reads" on public.chat_message_reads for select using (auth.uid() = user_id);
create policy "Users can upsert own reads" on public.chat_message_reads for insert with check (auth.uid() = user_id);
create policy "Users can update own reads" on public.chat_message_reads for update using (auth.uid() = user_id);

insert into public.chat_rooms (id, name, type)
values ('00000000-0000-0000-0000-000000000001', 'Chat da Equipe', 'group')
on conflict (id) do nothing;

CREATE TABLE IF NOT EXISTS public.ia_training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'instruction'
    CHECK (category IN ('instruction', 'qa_example', 'context')),
  title text NOT NULL,
  content text NOT NULL,
  question text,
  answer text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ia_training_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_ia_training"
  ON public.ia_training_data FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));
CREATE POLICY "authenticated_select_ia_training" ON public.ia_training_data FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_insert_ia_training" ON public.ia_training_data FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY "owner_update_ia_training" ON public.ia_training_data FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_ia_training" ON public.ia_training_data FOR DELETE USING (auth.uid() = user_id);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
create policy "Authenticated users can view all profiles" on public.user_profiles for select using (auth.uid() is not null);
create policy "Users can insert own profile" on public.user_profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = id);

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
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.user_profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'Usuário')
from auth.users u
where not exists (select 1 from public.user_profiles p where p.id = u.id);

create index if not exists idx_user_profiles_display_name on public.user_profiles(display_name);

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations, public.ai_messages, public.chat_rooms, public.chat_room_members, public.chat_messages, public.chat_message_reads, public.ia_training_data, public.user_profiles TO authenticated;
GRANT ALL ON public.ai_conversations, public.ai_messages, public.chat_rooms, public.chat_room_members, public.chat_messages, public.chat_message_reads, public.ia_training_data, public.user_profiles TO service_role;