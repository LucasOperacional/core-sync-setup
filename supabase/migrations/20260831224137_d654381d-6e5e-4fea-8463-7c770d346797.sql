-- Trigger de criação de perfil e backfill
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

INSERT INTO public.user_profiles (id, display_name)
SELECT u.id, coalesce(u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'Usuário')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id);

-- Função auxiliar de storage
CREATE OR REPLACE FUNCTION public.owns_protocolo_path(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.protocolos p
    WHERE p.id::text = split_part(_name, '/', 1)
      AND (p.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  )
$fn$;
REVOKE ALL ON FUNCTION public.owns_protocolo_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_protocolo_path(text) TO authenticated, service_role;

-- Políticas de storage
DROP POLICY IF EXISTS "relatorios read" ON storage.objects;
CREATE POLICY "relatorios read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'relatorios');
DROP POLICY IF EXISTS "relatorios admin insert" ON storage.objects;
CREATE POLICY "relatorios admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "relatorios admin update" ON storage.objects;
CREATE POLICY "relatorios admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "relatorios admin delete" ON storage.objects;
CREATE POLICY "relatorios admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'relatorios' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated users can upload faltas files" ON storage.objects;
CREATE POLICY "Authenticated users can upload faltas files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'faltas-pdfs');
DROP POLICY IF EXISTS "Authenticated users can read faltas files" ON storage.objects;
CREATE POLICY "Authenticated users can read faltas files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'faltas-pdfs');
DROP POLICY IF EXISTS "Authenticated users can upload faltas planilhas" ON storage.objects;
CREATE POLICY "Authenticated users can upload faltas planilhas" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Authenticated users can read faltas planilhas" ON storage.objects;
CREATE POLICY "Authenticated users can read faltas planilhas" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Admins can delete faltas files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete faltas planilhas" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete faltas planilhas" ON storage.objects;
CREATE POLICY "Auth users can delete faltas planilhas" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'faltas-planilhas');
DROP POLICY IF EXISTS "Auth users can delete faltas pdfs" ON storage.objects;
CREATE POLICY "Auth users can delete faltas pdfs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'faltas-pdfs');

DROP POLICY IF EXISTS "Authenticated users can upload atestados for verification" ON storage.objects;
CREATE POLICY "Authenticated users can upload atestados for verification" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'atestados-verificacao');
DROP POLICY IF EXISTS "Admins can delete atestados verification" ON storage.objects;
CREATE POLICY "Admins can delete atestados verification" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'atestados-verificacao' AND private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Authenticated users can read own atestados verification" ON storage.objects;
DROP POLICY IF EXISTS "Users read own atestados verification" ON storage.objects;
CREATE POLICY "Users read own atestados verification" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'atestados-verificacao' AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.atestados_verificados av WHERE av.caminho_storage = storage.objects.name AND av.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS folhas_pdf_select ON storage.objects;
CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
DROP POLICY IF EXISTS folhas_pdf_insert ON storage.objects;
CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
DROP POLICY IF EXISTS folhas_pdf_update ON storage.objects;
CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name)) WITH CHECK (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));
DROP POLICY IF EXISTS folhas_pdf_delete ON storage.objects;
CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'folhas-pdf' AND public.owns_protocolo_path(name));

DROP POLICY IF EXISTS "Admins leem arquivos dos dashboards" ON storage.objects;
CREATE POLICY "Admins leem arquivos dos dashboards" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins enviam arquivos dos dashboards" ON storage.objects;
CREATE POLICY "Admins enviam arquivos dos dashboards" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins atualizam arquivos dos dashboards" ON storage.objects;
CREATE POLICY "Admins atualizam arquivos dos dashboards" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins removem arquivos dos dashboards" ON storage.objects;
CREATE POLICY "Admins removem arquivos dos dashboards" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'arquivos-dashboards' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can read chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read chat attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);