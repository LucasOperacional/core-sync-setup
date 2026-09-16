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

create policy "Authenticated users can view queues" on public.chat_queues for select using (auth.uid() is not null);
create policy "Admins can insert queues" on public.chat_queues for insert with check (public.has_role(auth.uid(),'admin'));
create policy "Admins can update queues" on public.chat_queues for update using (public.has_role(auth.uid(),'admin'));
create policy "Admins can delete queues" on public.chat_queues for delete using (public.has_role(auth.uid(),'admin'));

create policy "Authenticated users can view queue agents" on public.chat_queue_agents for select using (auth.uid() is not null);
create policy "Admins can insert queue agents" on public.chat_queue_agents for insert with check (public.has_role(auth.uid(),'admin'));
create policy "Admins can delete queue agents" on public.chat_queue_agents for delete using (public.has_role(auth.uid(),'admin'));

create policy "Agents, admins and requester can view conversations" on public.chat_queue_conversations for select to authenticated
  using (started_by = auth.uid() or assigned_to = auth.uid()
    or exists (select 1 from public.chat_queue_agents a where a.queue_id = chat_queue_conversations.queue_id and a.user_id = auth.uid())
    or public.has_role(auth.uid(),'admin'));
create policy "Users can open queue conversations" on public.chat_queue_conversations for insert to authenticated with check (started_by = auth.uid());
create policy "Agents and admins can update conversations" on public.chat_queue_conversations for update to authenticated
  using (assigned_to = auth.uid()
    or exists (select 1 from public.chat_queue_agents a where a.queue_id = chat_queue_conversations.queue_id and a.user_id = auth.uid())
    or public.has_role(auth.uid(),'admin'));

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
alter table public.security_audit_log enable row level security;
create policy "Authenticated users can read audit logs" on public.security_audit_log for select to authenticated using (true);
create policy "Authenticated users can insert audit logs" on public.security_audit_log for insert to authenticated with check (auth.uid() = user_id);
create policy "Authenticated users can update own audit logs" on public.security_audit_log for update to authenticated using (true);

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity, resource)
);
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_rate_limits" ON public.security_rate_limits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity)
);
ALTER TABLE public.security_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_blocklist" ON public.security_blocklist FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

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
ALTER TABLE public.nexti_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage nexti config" ON public.nexti_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.nexti_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nexti_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  name text,
  checklist_type_id integer,
  status_id integer,
  start_date_time timestamptz,
  finish_date_time timestamptz,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  workplace_ids bigint[] NOT NULL DEFAULT '{}',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nexti_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  checklist_id bigint,
  checklist_name text,
  checklist_type_id integer,
  person_id bigint,
  supervisor_nome text,
  workplace_id bigint,
  workplace_name text,
  cliente text,
  cidade text,
  uf text,
  answer_date timestamptz,
  reference_date date,
  register_date timestamptz,
  device_code text,
  total_perguntas integer NOT NULL DEFAULT 0,
  conformes integer NOT NULL DEFAULT 0,
  nao_conformes integer NOT NULL DEFAULT 0,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_date_idx ON public.nexti_checklist_answers (answer_date DESC);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_workplace_idx ON public.nexti_checklist_answers (workplace_id);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_person_idx ON public.nexti_checklist_answers (person_id);
ALTER TABLE public.nexti_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexti_checklist_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem checklists" ON public.nexti_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers FOR SELECT TO authenticated USING (true);
CREATE TRIGGER nexti_checklists_updated_at BEFORE UPDATE ON public.nexti_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER nexti_checklist_answers_updated_at BEFORE UPDATE ON public.nexti_checklist_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_queues, public.chat_queue_agents, public.chat_queue_conversations, public.security_audit_log, public.nexti_config TO authenticated;
GRANT SELECT ON public.security_rate_limits, public.security_blocklist, public.nexti_checklists, public.nexti_checklist_answers TO authenticated;
GRANT ALL ON public.chat_queues, public.chat_queue_agents, public.chat_queue_conversations, public.security_audit_log, public.security_rate_limits, public.security_blocklist, public.nexti_config, public.nexti_checklists, public.nexti_checklist_answers TO service_role;