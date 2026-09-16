REVOKE EXECUTE ON FUNCTION public.privacidade_expurgar_dados() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backup_listar_tabelas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacidade_expurgar_dados() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_listar_tabelas() TO service_role;