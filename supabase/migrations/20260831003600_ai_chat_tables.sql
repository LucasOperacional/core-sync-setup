-- AI Chat tables

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

create policy "Users can view own conversations"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.ai_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.ai_conversations for delete
  using (auth.uid() = user_id);

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

create policy "Users can view own messages"
  on public.ai_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own messages"
  on public.ai_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own messages"
  on public.ai_messages for update
  using (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.ai_messages for delete
  using (auth.uid() = user_id);
