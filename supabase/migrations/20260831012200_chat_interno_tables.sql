-- Chat Interno tables

-- Rooms (general + private)
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'group' check (type in ('group', 'private')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_rooms enable row level security;

-- Members
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

-- Messages
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

-- Read receipts
create table if not exists public.chat_message_reads (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique(room_id, user_id)
);

create index if not exists idx_chat_reads_room_user on public.chat_message_reads(room_id, user_id);

alter table public.chat_message_reads enable row level security;

-- RLS policies for chat_rooms
create policy "Users can view rooms they belong to"
  on public.chat_rooms for select
  using (
    exists (
      select 1 from public.chat_room_members
      where chat_room_members.room_id = chat_rooms.id
        and chat_room_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create rooms"
  on public.chat_rooms for insert
  with check (auth.uid() is not null);

create policy "Room admins can update rooms"
  on public.chat_rooms for update
  using (
    exists (
      select 1 from public.chat_room_members
      where chat_room_members.room_id = chat_rooms.id
        and chat_room_members.user_id = auth.uid()
        and chat_room_members.role = 'admin'
    )
  );

-- RLS policies for chat_room_members
create policy "Members can view room members"
  on public.chat_room_members for select
  using (
    exists (
      select 1 from public.chat_room_members as m
      where m.room_id = chat_room_members.room_id
        and m.user_id = auth.uid()
    )
  );

create policy "Authenticated users can insert members"
  on public.chat_room_members for insert
  with check (auth.uid() is not null);

create policy "Members can remove themselves"
  on public.chat_room_members for delete
  using (user_id = auth.uid());

-- RLS policies for chat_messages
create policy "Members can view room messages"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_room_members
      where chat_room_members.room_id = chat_messages.room_id
        and chat_room_members.user_id = auth.uid()
    )
  );

create policy "Members can insert messages"
  on public.chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.chat_room_members
      where chat_room_members.room_id = chat_messages.room_id
        and chat_room_members.user_id = auth.uid()
    )
  );

create policy "Users can update own messages"
  on public.chat_messages for update
  using (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

-- RLS policies for chat_message_reads
create policy "Users can view own reads"
  on public.chat_message_reads for select
  using (auth.uid() = user_id);

create policy "Users can upsert own reads"
  on public.chat_message_reads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own reads"
  on public.chat_message_reads for update
  using (auth.uid() = user_id);

-- Storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload chat attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and auth.uid() is not null
  );

create policy "Authenticated users can read chat attachments"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and auth.uid() is not null
  );

-- Seed the general room
insert into public.chat_rooms (id, name, type)
values ('00000000-0000-0000-0000-000000000001', 'Chat da Equipe', 'group')
on conflict (id) do nothing;
