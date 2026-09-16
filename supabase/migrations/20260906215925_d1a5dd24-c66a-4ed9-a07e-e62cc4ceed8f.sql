REVOKE ALL ON FUNCTION public.tem_papel_interno(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.pode_gerir_atendimento(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.pode_ver_conversa(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tem_papel_interno(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_gerir_atendimento(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_ver_conversa(uuid, uuid) TO authenticated, service_role;