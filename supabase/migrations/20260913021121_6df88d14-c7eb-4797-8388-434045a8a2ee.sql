CREATE OR REPLACE FUNCTION public.pode_autorizar_movimentacao(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role IN ('admin'::public.app_role, 'diretor'::public.app_role, 'cordenador'::public.app_role)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.pode_autorizar_movimentacao(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pode_autorizar_movimentacao(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.nxs_can_manage(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.nxs_is_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.nxs_is_admin_geral(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.privacidade_expurgar_dados() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.nxs_can_manage(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nxs_is_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nxs_is_admin_geral(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.privacidade_expurgar_dados() TO service_role;
GRANT EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) TO authenticated, service_role;