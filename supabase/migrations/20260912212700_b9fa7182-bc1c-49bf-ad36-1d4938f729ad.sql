DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND policyname LIKE '%\_authenticated\_all'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- crt_lancamentos: leitura restrita ao criador ou equipe interna
DROP POLICY IF EXISTS crt_select_auth ON public.crt_lancamentos;
CREATE POLICY crt_select_interno ON public.crt_lancamentos
FOR SELECT TO authenticated
USING (auth.uid() = criado_por OR public.tem_papel_interno(auth.uid()));

-- security_audit_log: somente admins leem/atualizam
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Authenticated users can update own audit logs" ON public.security_audit_log;

-- storage: remover políticas amplas por bucket
DROP POLICY IF EXISTS authenticated_read_app_files ON storage.objects;
DROP POLICY IF EXISTS authenticated_write_app_files ON storage.objects;
DROP POLICY IF EXISTS authenticated_update_app_files ON storage.objects;
DROP POLICY IF EXISTS authenticated_delete_app_files ON storage.objects;

-- funções SECURITY DEFINER que não devem ser chamadas pelo cliente
REVOKE EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) FROM anon;