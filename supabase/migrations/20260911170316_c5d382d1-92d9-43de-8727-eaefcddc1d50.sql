DROP POLICY "admin_full_access_ia_training" ON public.ia_training_data;
CREATE POLICY "admin_full_access_ia_training" ON public.ia_training_data FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "Admins gerenciam arquivos importados" ON public.arquivos_importados;
CREATE POLICY "Admins gerenciam arquivos importados" ON public.arquivos_importados FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "Admins gerenciam historico de sincronizacao" ON public.arquivos_sincronizacoes;
CREATE POLICY "Admins gerenciam historico de sincronizacao" ON public.arquivos_sincronizacoes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "Admins gerenciam configuracao de dashboards" ON public.dashboards_config;
CREATE POLICY "Admins gerenciam configuracao de dashboards" ON public.dashboards_config FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_companies_admin" ON public.nexti_companies;
CREATE POLICY "nexti_companies_admin" ON public.nexti_companies FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_workplaces_admin" ON public.nexti_workplaces;
CREATE POLICY "nexti_workplaces_admin" ON public.nexti_workplaces FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_areas_admin" ON public.nexti_areas;
CREATE POLICY "nexti_areas_admin" ON public.nexti_areas FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_careers_admin" ON public.nexti_careers;
CREATE POLICY "nexti_careers_admin" ON public.nexti_careers FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_persons_admin" ON public.nexti_persons;
CREATE POLICY "nexti_persons_admin" ON public.nexti_persons FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_absences_select" ON public.nexti_absences;
CREATE POLICY "nexti_absences_select" ON public.nexti_absences FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gerente'::public.app_role));
DROP POLICY "nexti_absences_admin" ON public.nexti_absences;
CREATE POLICY "nexti_absences_admin" ON public.nexti_absences FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_documents_select" ON public.nexti_documents;
CREATE POLICY "nexti_documents_select" ON public.nexti_documents FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_role(auth.uid(),'gerente'::public.app_role));
DROP POLICY "nexti_documents_admin" ON public.nexti_documents;
CREATE POLICY "nexti_documents_admin" ON public.nexti_documents FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_document_types_admin" ON public.nexti_document_types;
CREATE POLICY "nexti_document_types_admin" ON public.nexti_document_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_clockings_admin" ON public.nexti_clockings;
CREATE POLICY "nexti_clockings_admin" ON public.nexti_clockings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_sync_runs_admin" ON public.nexti_sync_runs;
CREATE POLICY "nexti_sync_runs_admin" ON public.nexti_sync_runs FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY "nexti_sync_errors_admin" ON public.nexti_sync_errors;
CREATE POLICY "nexti_sync_errors_admin" ON public.nexti_sync_errors FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;