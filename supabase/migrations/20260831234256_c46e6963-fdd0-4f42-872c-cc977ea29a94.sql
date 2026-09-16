DROP POLICY IF EXISTS "Queue agents and admins can view conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents, admins and requester can view conversations"
  ON public.chat_queue_conversations FOR SELECT TO authenticated
  USING (
    started_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_queue_agents a
      WHERE a.queue_id = chat_queue_conversations.queue_id AND a.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Queue agents and admins can update conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents and admins can update conversations"
  ON public.chat_queue_conversations FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_queue_agents a
      WHERE a.queue_id = chat_queue_conversations.queue_id AND a.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Authenticated users can insert queue conversations" ON public.chat_queue_conversations;
CREATE POLICY "Users can open queue conversations"
  ON public.chat_queue_conversations FOR INSERT TO authenticated
  WITH CHECK (started_by = auth.uid());