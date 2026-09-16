-- ========== 1. Perfis de usuário: visibilidade restrita ==========
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.user_profiles;
CREATE POLICY "user_profiles_select_scoped" ON public.user_profiles FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gerente')
  OR EXISTS (
    SELECT 1 FROM public.chat_room_members m1
    JOIN public.chat_room_members m2 ON m2.room_id = m1.room_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = user_profiles.id
  )
);

-- ========== 2. Auditoria de segurança: só admin lê/altera ==========
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Authenticated users can update own audit logs" ON public.security_audit_log;
CREATE POLICY "security_audit_log_admin_read" ON public.security_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "security_audit_log_admin_update" ON public.security_audit_log FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== 3. Tabelas operacionais: leitura para equipe, escrita para admin/gerente ==========
DROP POLICY IF EXISTS "colaboradores_ponto_auth_all" ON public.colaboradores_ponto;
CREATE POLICY "colaboradores_ponto_select" ON public.colaboradores_ponto FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "colaboradores_ponto_write" ON public.colaboradores_ponto FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "Usuarios autenticados gerenciam funcionarios ativos" ON public.funcionarios_ativos;
CREATE POLICY "funcionarios_ativos_select" ON public.funcionarios_ativos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "funcionarios_ativos_write" ON public.funcionarios_ativos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "gerentes readable" ON public.gerentes;
CREATE POLICY "gerentes_select" ON public.gerentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));

DROP POLICY IF EXISTS "visitas readable" ON public.visitas;
CREATE POLICY "visitas_select" ON public.visitas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));

DROP POLICY IF EXISTS "arquivos readable" ON public.arquivos;
CREATE POLICY "arquivos_select" ON public.arquivos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));

DROP POLICY IF EXISTS "Authenticated users can manage protocolos" ON public.protocolo_cartoes_ponto;
CREATE POLICY "protocolo_cartoes_ponto_select" ON public.protocolo_cartoes_ponto FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "protocolo_cartoes_ponto_write" ON public.protocolo_cartoes_ponto FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "protocolos_ponto_auth_all" ON public.protocolos_ponto;
CREATE POLICY "protocolos_ponto_select" ON public.protocolos_ponto FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "protocolos_ponto_write" ON public.protocolos_ponto FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "protocolo_ponto_itens_auth_all" ON public.protocolo_ponto_itens;
CREATE POLICY "protocolo_ponto_itens_select" ON public.protocolo_ponto_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
CREATE POLICY "protocolo_ponto_itens_write" ON public.protocolo_ponto_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

-- ========== 4. Tabelas NEXTI: leitura restrita à equipe ==========
DROP POLICY IF EXISTS "nexti_persons_select" ON public.nexti_persons;
CREATE POLICY "nexti_persons_select" ON public.nexti_persons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_companies_select" ON public.nexti_companies;
CREATE POLICY "nexti_companies_select" ON public.nexti_companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_workplaces_select" ON public.nexti_workplaces;
CREATE POLICY "nexti_workplaces_select" ON public.nexti_workplaces FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_clockings_select" ON public.nexti_clockings;
CREATE POLICY "nexti_clockings_select" ON public.nexti_clockings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_careers_select" ON public.nexti_careers;
CREATE POLICY "nexti_careers_select" ON public.nexti_careers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_areas_select" ON public.nexti_areas;
CREATE POLICY "nexti_areas_select" ON public.nexti_areas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_document_types_select" ON public.nexti_document_types;
CREATE POLICY "nexti_document_types_select" ON public.nexti_document_types FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_sync_runs_select" ON public.nexti_sync_runs;
CREATE POLICY "nexti_sync_runs_select" ON public.nexti_sync_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "nexti_sync_errors_select" ON public.nexti_sync_errors;
CREATE POLICY "nexti_sync_errors_select" ON public.nexti_sync_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "Autenticados leem checklists" ON public.nexti_checklists;
CREATE POLICY "nexti_checklists_select" ON public.nexti_checklists FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));
DROP POLICY IF EXISTS "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers;
CREATE POLICY "nexti_checklist_answers_select" ON public.nexti_checklist_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'visualizador'));

-- ========== 5. Storage: atestados-verificacao (admin/gerente) ==========
DROP POLICY IF EXISTS "Authenticated users can read own atestados verification" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload atestados for verification" ON storage.objects;
CREATE POLICY "atestados_verificacao_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'atestados-verificacao' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "atestados_verificacao_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atestados-verificacao' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));

-- ========== 6. Storage: chat-attachments (somente membros da sala) ==========
DROP POLICY IF EXISTS "Authenticated users can read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete chat attachments" ON storage.objects;
CREATE POLICY "chat_attachments_member_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    AND public.is_chat_room_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
CREATE POLICY "chat_attachments_member_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    AND public.is_chat_room_member((split_part(name, '/', 1))::uuid, auth.uid())
    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    AND (split_part(name, '/', 2))::uuid = auth.uid()
  );
CREATE POLICY "chat_attachments_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    AND (
      (split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$' AND (split_part(name, '/', 2))::uuid = auth.uid())
      OR public.is_chat_room_admin((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ========== 7. Storage: faltas-pdfs e faltas-planilhas (admin/gerente) ==========
DROP POLICY IF EXISTS "Authenticated users can read faltas files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload faltas files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete faltas pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read faltas planilhas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload faltas planilhas" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete faltas planilhas" ON storage.objects;
CREATE POLICY "faltas_pdfs_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-pdfs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "faltas_pdfs_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-pdfs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "faltas_pdfs_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-pdfs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "faltas_planilhas_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-planilhas' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "faltas_planilhas_staff_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-planilhas' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));
CREATE POLICY "faltas_planilhas_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-planilhas' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));

-- ========== 8. Storage: relatorios (leitura admin/gerente) ==========
DROP POLICY IF EXISTS "relatorios read" ON storage.objects;
CREATE POLICY "relatorios_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'relatorios' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente')));