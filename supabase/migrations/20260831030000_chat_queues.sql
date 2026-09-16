-- Chat Queues (Filas de Atendimento)

create table if not exists public.chat_queues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  department text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_queues enable row level security;
alter table public.chat_queues replica identity full;

create index if not exists idx_chat_queues_active on public.chat_queues(active);
create index if not exists idx_chat_queues_department on public.chat_queues(department);

-- Queue agents (atendentes)
create table if not exists public.chat_queue_agents (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.chat_queues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique(queue_id, user_id)
);

alter table public.chat_queue_agents enable row level security;
alter table public.chat_queue_agents replica identity full;

create index if not exists idx_chat_queue_agents_queue on public.chat_queue_agents(queue_id);
create index if not exists idx_chat_queue_agents_user on public.chat_queue_agents(user_id);

-- Queue conversations
create table if not exists public.chat_queue_conversations (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.chat_queues(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'finished')),
  assigned_to uuid references auth.users(id) on delete set null,
  started_by uuid references auth.users(id) on delete set null,
  subject text not null default '',
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.chat_queue_conversations enable row level security;
alter table public.chat_queue_conversations replica identity full;

create index if not exists idx_chat_queue_conv_queue on public.chat_queue_conversations(queue_id);
create index if not exists idx_chat_queue_conv_status on public.chat_queue_conversations(status);
create index if not exists idx_chat_queue_conv_assigned on public.chat_queue_conversations(assigned_to);

-- RLS: chat_queues
create policy "Authenticated users can view queues"
  on public.chat_queues for select
  using (auth.uid() is not null);

create policy "Admins can insert queues"
  on public.chat_queues for insert
  with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Admins can update queues"
  on public.chat_queues for update
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Admins can delete queues"
  on public.chat_queues for delete
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- RLS: chat_queue_agents
create policy "Authenticated users can view queue agents"
  on public.chat_queue_agents for select
  using (auth.uid() is not null);

create policy "Admins can insert queue agents"
  on public.chat_queue_agents for insert
  with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Admins can delete queue agents"
  on public.chat_queue_agents for delete
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- RLS: chat_queue_conversations
create policy "Queue agents and admins can view conversations"
  on public.chat_queue_conversations for select
  using (
    exists (
      select 1 from public.chat_queue_agents
      where chat_queue_agents.queue_id = chat_queue_conversations.queue_id
        and chat_queue_agents.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Authenticated users can insert queue conversations"
  on public.chat_queue_conversations for insert
  with check (auth.uid() is not null);

create policy "Queue agents and admins can update conversations"
  on public.chat_queue_conversations for update
  using (
    exists (
      select 1 from public.chat_queue_agents
      where chat_queue_agents.queue_id = chat_queue_conversations.queue_id
        and chat_queue_agents.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );
