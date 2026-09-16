-- 1) Remove redundant permissive (USING true) policies on public tables
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Usuários autenticados visualizam postos de gerentes" ON public.areas_gerentes_postos;
DROP POLICY IF EXISTS "arquivos readable" ON public.arquivos;
DROP POLICY IF EXISTS "gerentes readable" ON public.gerentes;
DROP POLICY IF EXISTS "visitas readable" ON public.visitas;
DROP POLICY IF EXISTS "Usuários autenticados podem consultar canais" ON public.canais_drm;
DROP POLICY IF EXISTS "Authenticated users can view workplace movements" ON public.movimentacoes_posto;
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Authenticated users can update own audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Autenticados leem checklists" ON public.nexti_checklists;
DROP POLICY IF EXISTS "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers;
DROP POLICY IF EXISTS "avaliacoes_select" ON public.avaliacoes_gerentes_area;
DROP POLICY IF EXISTS "faltas_lancamentos_select" ON public.faltas_lancamentos;

-- 2) Internal-role scoped replacements
DROP POLICY IF EXISTS "areas_gerentes_postos_select_interno" ON public.areas_gerentes_postos;
CREATE POLICY "areas_gerentes_postos_select_interno" ON public.areas_gerentes_postos
  FOR SELECT TO authenticated USING (public.tem_papel_interno(auth.uid()));

DROP POLICY IF EXISTS "avaliacoes_select_gestor" ON public.avaliacoes_gerentes_area;
CREATE POLICY "avaliacoes_select_gestor" ON public.avaliacoes_gerentes_area
  FOR SELECT TO authenticated USING (
    avaliador_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'diretor'::public.app_role)
    OR public.has_role(auth.uid(), 'cordenador'::public.app_role)
  );

DROP POLICY IF EXISTS "faltas_lancamentos_select_interno" ON public.faltas_lancamentos;
CREATE POLICY "faltas_lancamentos_select_interno" ON public.faltas_lancamentos
  FOR SELECT TO authenticated USING (public.tem_papel_interno(auth.uid()));

-- 3) ferias_usuarios_flags: only management roles may read/write
DROP POLICY IF EXISTS ferias_flags_select ON public.ferias_usuarios_flags;
DROP POLICY IF EXISTS ferias_flags_insert ON public.ferias_usuarios_flags;
DROP POLICY IF EXISTS ferias_flags_update ON public.ferias_usuarios_flags;
DROP POLICY IF EXISTS ferias_flags_delete ON public.ferias_usuarios_flags;
DROP POLICY IF EXISTS ferias_flags_write ON public.ferias_usuarios_flags;

CREATE POLICY ferias_flags_select ON public.ferias_usuarios_flags
  FOR SELECT TO authenticated USING (public.tem_papel_interno(auth.uid()));
CREATE POLICY ferias_flags_write ON public.ferias_usuarios_flags
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'diretor'::public.app_role)
    OR public.has_role(auth.uid(), 'cordenador'::public.app_role)
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'diretor'::public.app_role)
    OR public.has_role(auth.uid(), 'cordenador'::public.app_role)
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

-- 4) Drop bucket_id-only storage policies (no ownership/role check)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~ '(has_role|tem_papel_interno|is_chat_room|owns_protocolo|EXISTS|nxs_)'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- 5) Internal-staff scoped storage access for internal document buckets
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['protocolos','relatorios','solicitacoes-vagas','folhas-pdf','arquivos-dashboards','projeto-atualizacoes','assinaturas','checklist-fotos','faltas-pdfs','faltas-planilhas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_interno_select');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_interno_insert');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_interno_update');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_interno_delete');

    EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND public.tem_papel_interno(auth.uid()))$f$, b || '_interno_select', b);
    EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND public.tem_papel_interno(auth.uid()))$f$, b || '_interno_insert', b);
    EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND public.tem_papel_interno(auth.uid())) WITH CHECK (bucket_id = %L AND public.tem_papel_interno(auth.uid()))$f$, b || '_interno_update', b, b);
    EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND public.has_role(auth.uid(), 'admin'::public.app_role))$f$, b || '_interno_delete', b);
  END LOOP;
END $$;
