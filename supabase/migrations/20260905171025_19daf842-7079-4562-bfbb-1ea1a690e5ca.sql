create table if not exists public.chat_direct_conversations (
  id uuid primary key default gen_random_uuid(),
  nexti_person_id bigint not null unique,
  contato_nome text not null,
  contato_matricula text,
  contato_posto text,
  contato_cargo text,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','finalizada')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_direct_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  autor text not null default 'agente' check (autor in ('agente','contato','sistema')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_direct_transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_direct_conversations(id) on delete cascade,
  de_user_id uuid,
  para_user_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists chat_direct_messages_conv_idx on public.chat_direct_messages(conversation_id, created_at);
create index if not exists chat_direct_conv_status_idx on public.chat_direct_conversations(status);

grant select, insert, update, delete on public.chat_direct_conversations to authenticated;
grant all on public.chat_direct_conversations to service_role;
grant select, insert on public.chat_direct_messages to authenticated;
grant all on public.chat_direct_messages to service_role;
grant select, insert on public.chat_direct_transfers to authenticated;
grant all on public.chat_direct_transfers to service_role;

alter table public.chat_direct_conversations enable row level security;
alter table public.chat_direct_messages enable row level security;
alter table public.chat_direct_transfers enable row level security;

drop policy if exists "direct conv read" on public.chat_direct_conversations;
create policy "direct conv read" on public.chat_direct_conversations for select to authenticated using (true);
drop policy if exists "direct conv write" on public.chat_direct_conversations;
create policy "direct conv write" on public.chat_direct_conversations for insert to authenticated with check (true);
drop policy if exists "direct conv update" on public.chat_direct_conversations;
create policy "direct conv update" on public.chat_direct_conversations for update to authenticated using (true) with check (true);

drop policy if exists "direct msg read" on public.chat_direct_messages;
create policy "direct msg read" on public.chat_direct_messages for select to authenticated using (true);
drop policy if exists "direct msg write" on public.chat_direct_messages;
create policy "direct msg write" on public.chat_direct_messages for insert to authenticated with check (user_id = auth.uid() or user_id is null);

drop policy if exists "direct transfer read" on public.chat_direct_transfers;
create policy "direct transfer read" on public.chat_direct_transfers for select to authenticated using (true);
drop policy if exists "direct transfer write" on public.chat_direct_transfers;
create policy "direct transfer write" on public.chat_direct_transfers for insert to authenticated with check (true);

drop trigger if exists chat_direct_conv_updated on public.chat_direct_conversations;
create trigger chat_direct_conv_updated before update on public.chat_direct_conversations
for each row execute function public.update_updated_at_column();