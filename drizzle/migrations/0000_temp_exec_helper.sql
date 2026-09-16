CREATE OR REPLACE FUNCTION public.__tmp_exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE sql;
END;
$fn$;

REVOKE ALL ON FUNCTION public.__tmp_exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__tmp_exec_sql(text) TO service_role;