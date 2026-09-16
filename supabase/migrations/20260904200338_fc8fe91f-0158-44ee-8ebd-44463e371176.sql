CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "Authenticated users can read chat attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "Authenticated users can delete chat attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-attachments');

CREATE OR REPLACE FUNCTION public.is_chat_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = _room_id AND m.user_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.is_chat_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = _room_id AND m.user_id = _user_id AND m.role = 'admin')
$$;
REVOKE ALL ON FUNCTION public.is_chat_room_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_chat_room_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_room_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_room_admin(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can view room members" ON public.chat_room_members;
CREATE POLICY "Members can view room members" ON public.chat_room_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_member(room_id, auth.uid()));
DROP POLICY IF EXISTS "Members can remove themselves" ON public.chat_room_members;
CREATE POLICY "Members or room admins can remove members" ON public.chat_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()));
CREATE POLICY "Members or room admins can update membership" ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()));
DROP POLICY IF EXISTS "Users can view rooms they belong to" ON public.chat_rooms;
CREATE POLICY "Users can view rooms they belong to" ON public.chat_rooms FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_chat_room_member(id, auth.uid()));
DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can update rooms" ON public.chat_rooms FOR UPDATE TO authenticated
  USING (public.is_chat_room_admin(id, auth.uid()));
CREATE POLICY "Room admins can delete rooms" ON public.chat_rooms FOR DELETE TO authenticated
  USING (public.is_chat_room_admin(id, auth.uid()) AND id <> '00000000-0000-0000-0000-000000000001'::uuid);
DROP POLICY IF EXISTS "Members can view room messages" ON public.chat_messages;
CREATE POLICY "Members can view room messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_room_member(room_id, auth.uid()));
DROP POLICY IF EXISTS "Members can insert messages" ON public.chat_messages;
CREATE POLICY "Members can insert messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_room_member(room_id, auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_rooms','chat_room_members','chat_messages','chat_message_reads','chat_queues','chat_queue_agents','chat_queue_conversations','user_profiles','nexti_persons','nexti_absences','nexti_clockings','nexti_documents','nexti_sync_runs','nexti_workplaces','nexti_checklist_answers','protocolos','protocolo_folhas','protocolo_arquivos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;