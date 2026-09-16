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
grant select, insert, update, delete on public.chat_queues to authenticated;
grant all on public.chat_queues to service_role;
alter table public.chat_queues enable row level security;
alter table public.chat_queues replica identity full;
create index if not exists idx_chat_queues_active on public.chat_queues(active);
create index if not exists idx_chat_queues_department on public.chat_queues(department);

create table if not exists public.chat_queue_agents (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.chat_queues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique(queue_id, user_id)
);
grant select, insert, delete on public.chat_queue_agents to authenticated;
grant all on public.chat_queue_agents to service_role;
alter table public.chat_queue_agents enable row level security;
alter table public.chat_queue_agents replica identity full;
create index if not exists idx_chat_queue_agents_queue on public.chat_queue_agents(queue_id);
create index if not exists idx_chat_queue_agents_user on public.chat_queue_agents(user_id);

create or replace function public.is_queue_agent(_queue_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.chat_queue_agents a where a.queue_id = _queue_id and a.user_id = _user_id)
$fn$;
revoke all on function public.is_queue_agent(uuid, uuid) from public, anon;
grant execute on function public.is_queue_agent(uuid, uuid) to authenticated, service_role;

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
grant select, insert, update on public.chat_queue_conversations to authenticated;
grant all on public.chat_queue_conversations to service_role;
alter table public.chat_queue_conversations enable row level security;
alter table public.chat_queue_conversations replica identity full;
create index if not exists idx_chat_queue_conv_queue on public.chat_queue_conversations(queue_id);
create index if not exists idx_chat_queue_conv_status on public.chat_queue_conversations(status);
create index if not exists idx_chat_queue_conv_assigned on public.chat_queue_conversations(assigned_to);

create policy "Authenticated users can view queues" on public.chat_queues for select to authenticated using (auth.uid() is not null);
create policy "Admins can insert queues" on public.chat_queues for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update queues" on public.chat_queues for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete queues" on public.chat_queues for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Authenticated users can view queue agents" on public.chat_queue_agents for select to authenticated using (auth.uid() is not null);
create policy "Admins can insert queue agents" on public.chat_queue_agents for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete queue agents" on public.chat_queue_agents for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Queue agents and admins can view conversations" on public.chat_queue_conversations for select to authenticated
  using (public.is_queue_agent(queue_id, auth.uid()) or public.has_role(auth.uid(), 'admin'));
create policy "Authenticated users can insert queue conversations" on public.chat_queue_conversations for insert to authenticated with check (auth.uid() is not null);
create policy "Queue agents and admins can update conversations" on public.chat_queue_conversations for update to authenticated
  using (public.is_queue_agent(queue_id, auth.uid()) or public.has_role(auth.uid(), 'admin'))
  with check (public.is_queue_agent(queue_id, auth.uid()) or public.has_role(auth.uid(), 'admin'));

create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text not null default 'low',
  description text not null,
  metadata jsonb default '{}',
  ip_address text,
  user_agent text,
  requires_admin_approval boolean default false,
  admin_approved boolean,
  admin_approved_by uuid references auth.users(id) on delete set null,
  admin_approved_at timestamptz,
  allows_rollback boolean default false,
  rolled_back boolean default false,
  rolled_back_at timestamptz,
  created_at timestamptz default now()
);
grant select, insert, update on public.security_audit_log to authenticated;
grant all on public.security_audit_log to service_role;
alter table public.security_audit_log enable row level security;
create policy "Authenticated users can read audit logs" on public.security_audit_log for select to authenticated using (true);
create policy "Authenticated users can insert audit logs" on public.security_audit_log for insert to authenticated with check (auth.uid() = user_id);
create policy "Admins can update audit logs" on public.security_audit_log for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "relatorios read" ON storage.objects;
CREATE POLICY "relatorios read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'relatorios');
DROP POLICY IF EXISTS "relatorios admin insert" ON storage.objects;
CREATE POLICY "relatorios admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "relatorios admin update" ON storage.objects;
CREATE POLICY "relatorios admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "relatorios admin delete" ON storage.objects;
CREATE POLICY "relatorios admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated users can upload faltas files" ON storage.objects;
CREATE POLICY "Authenticated users can upload faltas files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'faltas-pdfs');
DROP POLICY IF EXISTS "Authenticated users can read faltas files" ON storage.objects;
CREATE POLICY "Authenticated users can read faltas files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'faltas-pdfs');
DROP POLICY IF EXISTS "Authenticated users can upload faltas planilhas" ON storage.objects;
CREATE POLICY "Authenticated users can upload faltas planilhas" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Authenticated users can read faltas planilhas" ON storage.objects;
CREATE POLICY "Authenticated users can read faltas planilhas" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Admins can delete faltas files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete faltas planilhas" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete faltas planilhas" ON storage.objects;
CREATE POLICY "Auth users can delete faltas planilhas" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Auth users can delete faltas pdfs" ON storage.objects;
CREATE POLICY "Auth users can delete faltas pdfs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'faltas-pdfs');

DROP POLICY IF EXISTS "Authenticated users can upload atestados for verification" ON storage.objects;
CREATE POLICY "Authenticated users can upload atestados for verification" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'atestados-verificacao');
DROP POLICY IF EXISTS "Admins can delete atestados verification" ON storage.objects;
CREATE POLICY "Admins can delete atestados verification" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'atestados-verificacao' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Authenticated users can read own atestados verification" ON storage.objects;
DROP POLICY IF EXISTS "Users read own atestados verification" ON storage.objects;
CREATE POLICY "Users read own atestados verification" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'atestados-verificacao' AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.atestados_verificados av WHERE av.caminho_storage = storage.objects.name AND av.user_id = auth.uid())
  )
);

CREATE TABLE IF NOT EXISTS public.nexti_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_url text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  token_endpoint text NOT NULL DEFAULT '',
  test_endpoint text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.nexti_config TO authenticated;
GRANT ALL ON public.nexti_config TO service_role;
ALTER TABLE public.nexti_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage nexti config" ON public.nexti_config;
CREATE POLICY "Admins manage nexti config" ON public.nexti_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));