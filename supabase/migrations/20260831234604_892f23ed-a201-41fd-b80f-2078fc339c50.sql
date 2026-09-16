CREATE POLICY "Members or room admins can update membership"
  ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()));