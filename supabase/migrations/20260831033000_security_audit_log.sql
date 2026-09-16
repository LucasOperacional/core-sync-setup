-- Security audit log table
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

create policy "Authenticated users can read audit logs"
  on public.security_audit_log for select
  to authenticated
  using (true);

create policy "Authenticated users can insert audit logs"
  on public.security_audit_log for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can update own audit logs"
  on public.security_audit_log for update
  to authenticated
  using (true);
