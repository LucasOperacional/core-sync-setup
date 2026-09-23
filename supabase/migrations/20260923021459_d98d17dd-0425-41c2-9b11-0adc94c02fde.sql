ALTER FUNCTION public.com_eh_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.com_eh_gestor(uuid) SET SCHEMA private;
ALTER FUNCTION public.com_pode_ver_responsavel(uuid, uuid) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.com_eh_gestor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.com_eh_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.com_equipe
    WHERE user_id = _user_id AND papel = 'gestor' AND ativo
  )
$$;

CREATE OR REPLACE FUNCTION private.com_pode_ver_responsavel(_responsavel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.com_eh_gestor(_user_id) OR _responsavel_id = _user_id
$$;

REVOKE ALL ON FUNCTION private.com_eh_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.com_eh_gestor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.com_pode_ver_responsavel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.com_eh_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.com_eh_gestor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.com_pode_ver_responsavel(uuid, uuid) TO authenticated, service_role;