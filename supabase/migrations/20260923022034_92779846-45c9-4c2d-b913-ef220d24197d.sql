CREATE OR REPLACE FUNCTION private.com_eh_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(lower(auth.jwt() ->> 'email') = 'lucasdallan@gmail.com', false)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'admin'::public.app_role
    )
$$;

CREATE OR REPLACE FUNCTION private.com_pode_ver_responsavel(_responsavel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.com_eh_admin(_user_id)
    OR _responsavel_id = _user_id
    OR EXISTS (
      SELECT 1
      FROM public.com_equipe gestor
      JOIN public.com_equipe vendedor ON vendedor.gestor_id = gestor.id
      WHERE gestor.user_id = _user_id
        AND gestor.papel = 'gestor'
        AND gestor.ativo
        AND vendedor.user_id = _responsavel_id
        AND vendedor.ativo
    )
$$;