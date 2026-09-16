REVOKE EXECUTE ON FUNCTION public.nxs_is_admin_geral(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nxs_is_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nxs_can_manage(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nxs_is_admin_geral(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nxs_is_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nxs_can_manage(uuid, uuid) TO authenticated, service_role;