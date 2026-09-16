alter table public.chat_direct_messages
  add column if not exists nexti_message_id text,
  add column if not exists entregue boolean not null default true,
  add column if not exists erro_envio text;

create unique index if not exists chat_direct_messages_nexti_id_uidx
  on public.chat_direct_messages (nexti_message_id)
  where nexti_message_id is not null;

alter table public.chat_direct_conversations
  add column if not exists ultima_leitura_nexti timestamptz;