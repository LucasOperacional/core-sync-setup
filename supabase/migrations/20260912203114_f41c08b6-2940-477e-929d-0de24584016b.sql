INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u WHERE lower(u.email) = 'admin@admin.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_permissions (user_id, page_key, allowed)
SELECT u.id, p.page_key, true
FROM auth.users u
CROSS JOIN (VALUES ('painel-nexti'),('nxs-control'),('control'),('faltas'),('admin'),('canais'),('atestados'),('verificador-atestados'),('protocolo-folhas-ponto'),('protocolo-limpeza-geral'),('assinatura-documentos'),('chat-ia'),('chat-interno'),('ia-operacional'),('lgpd'),('usuarios'),('vagas'),('supervisor'),('movimentacao-posto'),('rh'),('gps')) AS p(page_key)
WHERE lower(u.email) = 'admin@admin.com'
ON CONFLICT (user_id, page_key) DO UPDATE SET allowed = true;