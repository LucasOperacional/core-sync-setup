-- Helpers
CREATE OR REPLACE FUNCTION public.tem_papel_interno(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','gerente','visualizador','supervisor','mesa_operacional')
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_atendimento(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','diretor','cordenador','mesa_operacional')
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_conversa(_assigned uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_gerir_atendimento(_user_id)
      OR (public.tem_papel_interno(_user_id) AND (_assigned IS NULL OR _assigned = _user_id))
$$;

-- app_config
DROP POLICY IF EXISTS "app_config_select" ON public.app_config;
CREATE POLICY "app_config_select" ON public.app_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'diretor'));

-- canais_drm
DROP POLICY IF EXISTS "Usuários autenticados podem consultar canais" ON public.canais_drm;
CREATE POLICY "canais_drm_select_interno" ON public.canais_drm FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));

-- faltas_arquivos
DROP POLICY IF EXISTS "Usuários autenticados podem consultar arquivos de faltas" ON public.faltas_arquivos;
CREATE POLICY "faltas_arquivos_select_interno" ON public.faltas_arquivos FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));

-- nexti_*
DROP POLICY IF EXISTS "nexti_persons_select" ON public.nexti_persons;
CREATE POLICY "nexti_persons_select" ON public.nexti_persons FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_workplaces_select" ON public.nexti_workplaces;
CREATE POLICY "nexti_workplaces_select" ON public.nexti_workplaces FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_absences_select" ON public.nexti_absences;
CREATE POLICY "nexti_absences_select" ON public.nexti_absences FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_clockings_select" ON public.nexti_clockings;
CREATE POLICY "nexti_clockings_select" ON public.nexti_clockings FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));
DROP POLICY IF EXISTS "nexti_sync_runs_select" ON public.nexti_sync_runs;
CREATE POLICY "nexti_sync_runs_select" ON public.nexti_sync_runs FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()));

-- chat direct
DROP POLICY IF EXISTS "direct conv read" ON public.chat_direct_conversations;
DROP POLICY IF EXISTS "direct conv write" ON public.chat_direct_conversations;
DROP POLICY IF EXISTS "direct conv update" ON public.chat_direct_conversations;
CREATE POLICY "direct conv read" ON public.chat_direct_conversations FOR SELECT TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()));
CREATE POLICY "direct conv write" ON public.chat_direct_conversations FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_interno(auth.uid()));
CREATE POLICY "direct conv update" ON public.chat_direct_conversations FOR UPDATE TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()))
  WITH CHECK (public.tem_papel_interno(auth.uid()));

DROP POLICY IF EXISTS "direct msg read" ON public.chat_direct_messages;
DROP POLICY IF EXISTS "direct msg write" ON public.chat_direct_messages;
CREATE POLICY "direct msg read" ON public.chat_direct_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
CREATE POLICY "direct msg write" ON public.chat_direct_messages FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL))
    AND EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));

DROP POLICY IF EXISTS "direct transfer read" ON public.chat_direct_transfers;
DROP POLICY IF EXISTS "direct transfer write" ON public.chat_direct_transfers;
CREATE POLICY "direct transfer read" ON public.chat_direct_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_direct_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
CREATE POLICY "direct transfer write" ON public.chat_direct_transfers FOR INSERT TO authenticated
  WITH CHECK (de_user_id = auth.uid() AND public.tem_papel_interno(auth.uid()));

-- whatsapp
DROP POLICY IF EXISTS "wa conv read" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "wa conv insert" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "wa conv update" ON public.whatsapp_conversations;
CREATE POLICY "wa conv read" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()));
CREATE POLICY "wa conv insert" ON public.whatsapp_conversations FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_interno(auth.uid()));
CREATE POLICY "wa conv update" ON public.whatsapp_conversations FOR UPDATE TO authenticated
  USING (public.pode_ver_conversa(assigned_to, auth.uid()))
  WITH CHECK (public.tem_papel_interno(auth.uid()));

DROP POLICY IF EXISTS "wa msg read" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wa msg insert" ON public.whatsapp_messages;
CREATE POLICY "wa msg read" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
CREATE POLICY "wa msg insert" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL))
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));

DROP POLICY IF EXISTS "wa transfer read" ON public.whatsapp_transfers;
DROP POLICY IF EXISTS "wa transfer insert" ON public.whatsapp_transfers;
CREATE POLICY "wa transfer read" ON public.whatsapp_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
                 WHERE c.id = conversation_id AND public.pode_ver_conversa(c.assigned_to, auth.uid())));
CREATE POLICY "wa transfer insert" ON public.whatsapp_transfers FOR INSERT TO authenticated
  WITH CHECK (de_user_id = auth.uid() AND public.tem_papel_interno(auth.uid()));

-- projeto_atualizacoes
DROP POLICY IF EXISTS "projeto_atualizacoes_read" ON public.projeto_atualizacoes;
DROP POLICY IF EXISTS "projeto_atualizacoes_insert" ON public.projeto_atualizacoes;
DROP POLICY IF EXISTS "projeto_atualizacoes_update" ON public.projeto_atualizacoes;
DROP POLICY IF EXISTS "projeto_atualizacoes_delete" ON public.projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_admin" ON public.projeto_atualizacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- storage objects do bucket projeto-atualizacoes
DROP POLICY IF EXISTS "projeto_atualizacoes_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "projeto_atualizacoes_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "projeto_atualizacoes_objects_update" ON storage.objects;
DROP POLICY IF EXISTS "projeto_atualizacoes_objects_delete" ON storage.objects;
CREATE POLICY "projeto_atualizacoes_objects_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'projeto-atualizacoes' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "projeto_atualizacoes_objects_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'projeto-atualizacoes' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "projeto_atualizacoes_objects_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'projeto-atualizacoes' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'projeto-atualizacoes' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "projeto_atualizacoes_objects_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'projeto-atualizacoes' AND public.has_role(auth.uid(),'admin'));

-- solicitacoes_vagas
DROP POLICY IF EXISTS "Usuarios autenticados veem solicitacoes de vagas" ON public.solicitacoes_vagas;
DROP POLICY IF EXISTS "Aprovadores atualizam solicitacoes de vagas" ON public.solicitacoes_vagas;
CREATE POLICY "Solicitante e aprovadores veem vagas" ON public.solicitacoes_vagas FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'));
CREATE POLICY "Aprovadores atualizam solicitacoes de vagas" ON public.solicitacoes_vagas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'))
  WITH CHECK (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'diretor')
      OR public.has_role(auth.uid(),'cordenador'));