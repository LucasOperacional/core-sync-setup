CREATE OR REPLACE FUNCTION public.lovable_import_exec(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE sql;
END;
$fn$;
REVOKE ALL ON FUNCTION public.lovable_import_exec(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lovable_import_exec(text) TO sandbox_exec;