-- Chat direto: remover políticas "true" (as políticas por participação já existem)
DROP POLICY IF EXISTS chat_direct_conv_auth ON public.chat_direct_conversations;
DROP POLICY IF EXISTS chat_direct_msg_auth ON public.chat_direct_messages;
DROP POLICY IF EXISTS chat_direct_transf_auth ON public.chat_direct_transfers;

-- Faltas: remover leitura aberta (já existe leitura por papel interno)
DROP POLICY IF EXISTS "Usuários autenticados podem consultar arquivos de faltas" ON public.faltas_arquivos;

-- Dados de treino da IA: leitura apenas do dono ou admin
DROP POLICY IF EXISTS authenticated_select_ia_training ON public.ia_training_data;
CREATE POLICY ia_training_select_owner ON public.ia_training_data
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Logs: impedir registros com user_id de terceiros
DROP POLICY IF EXISTS "Authenticated insert operational_errors" ON public.operational_errors;
CREATE POLICY operational_errors_insert_self ON public.operational_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated insert recovery_actions" ON public.recovery_actions;
CREATE POLICY recovery_actions_insert_interno ON public.recovery_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_interno(auth.uid()));

-- Filas de atendimento: visíveis apenas a papéis internos / agentes
DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.chat_queues;
CREATE POLICY chat_queues_select_interno ON public.chat_queues
  FOR SELECT TO authenticated USING (public.tem_papel_interno(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view queue agents" ON public.chat_queue_agents;
CREATE POLICY chat_queue_agents_select_interno ON public.chat_queue_agents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.tem_papel_interno(auth.uid()));

-- Salas de chat: só o próprio usuário ou admin da sala pode adicionar membros
DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.chat_room_members;
CREATE POLICY chat_room_members_insert_scoped ON public.chat_room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_room_admin(room_id, auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = chat_room_members.room_id)
  );
