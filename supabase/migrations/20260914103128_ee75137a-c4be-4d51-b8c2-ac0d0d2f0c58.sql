CREATE OR REPLACE FUNCTION public.backup_listar_tabelas()
RETURNS TABLE(nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
$$;

REVOKE ALL ON FUNCTION public.backup_listar_tabelas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_listar_tabelas() TO service_role;