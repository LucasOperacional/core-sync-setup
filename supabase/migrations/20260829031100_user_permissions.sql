-- Tabela para armazenar permissões de visualização por usuário
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_key text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, page_key)
);

alter table public.user_permissions enable row level security;

create policy "Admins can manage permissions"
  on public.user_permissions
  for all
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );
