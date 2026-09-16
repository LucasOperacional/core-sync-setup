GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) TO authenticated;