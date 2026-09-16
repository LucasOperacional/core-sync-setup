REVOKE ALL ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.privacidade_expurgar_dados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacidade_expurgar_dados() TO service_role;