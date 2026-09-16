ALTER TABLE public.nexti_config ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.eh_membro_sala(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = _room_id AND m.user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.eh_membro_sala(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.eh_membro_sala(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can view room members" ON public.chat_room_members;
CREATE POLICY "Members can view room members" ON public.chat_room_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.eh_membro_sala(room_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view rooms they belong to" ON public.chat_rooms;
CREATE POLICY "Users can view rooms they belong to" ON public.chat_rooms
FOR SELECT TO authenticated
USING (public.eh_membro_sala(id, auth.uid()));

DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can update rooms" ON public.chat_rooms
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = chat_rooms.id AND m.user_id = auth.uid() AND m.role = 'admin'));