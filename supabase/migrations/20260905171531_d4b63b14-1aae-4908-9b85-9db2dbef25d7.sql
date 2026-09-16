create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_chat_id text not null unique,
  telefone text,
  contato_nome text,
  is_group boolean not null default false,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','finalizada')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  nao_lidas integer not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  wa_message_id text,
  direcao text not null check (direcao in ('recebida','enviada','sistema')),
  autor_nome text,
  user_id uuid references auth.users(id) on delete set null,
  content text not null default '',
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  de_user_id uuid,
  para_user_id uuid,
  motivo text,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_wa_id_idx on public.whatsapp_messages(wa_message_id) where wa_message_id is not null;
create index if not exists whatsapp_messages_conv_idx on public.whatsapp_messages(conversation_id, created_at);
create index if not exists whatsapp_conv_status_idx on public.whatsapp_conversations(status, last_message_at desc);

grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant all on public.whatsapp_conversations to service_role;
grant select, insert on public.whatsapp_messages to authenticated;
grant all on public.whatsapp_messages to service_role;
grant select, insert on public.whatsapp_transfers to authenticated;
grant all on public.whatsapp_transfers to service_role;

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_transfers enable row level security;

drop policy if exists "wa conv read" on public.whatsapp_conversations;
create policy "wa conv read" on public.whatsapp_conversations for select to authenticated using (true);
drop policy if exists "wa conv insert" on public.whatsapp_conversations;
create policy "wa conv insert" on public.whatsapp_conversations for insert to authenticated with check (true);
drop policy if exists "wa conv update" on public.whatsapp_conversations;
create policy "wa conv update" on public.whatsapp_conversations for update to authenticated using (true) with check (true);

drop policy if exists "wa msg read" on public.whatsapp_messages;
create policy "wa msg read" on public.whatsapp_messages for select to authenticated using (true);
drop policy if exists "wa msg insert" on public.whatsapp_messages;
create policy "wa msg insert" on public.whatsapp_messages for insert to authenticated with check (true);

drop policy if exists "wa transfer read" on public.whatsapp_transfers;
create policy "wa transfer read" on public.whatsapp_transfers for select to authenticated using (true);
drop policy if exists "wa transfer insert" on public.whatsapp_transfers;
create policy "wa transfer insert" on public.whatsapp_transfers for insert to authenticated with check (true);

drop trigger if exists whatsapp_conv_updated on public.whatsapp_conversations;
create trigger whatsapp_conv_updated before update on public.whatsapp_conversations
for each row execute function public.update_updated_at_column();