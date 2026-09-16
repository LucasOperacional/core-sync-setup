CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Internal RLS helpers, moved out of the exposed API schema
CREATE OR REPLACE FUNCTION private.is_chat_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = _room_id AND m.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION private.is_chat_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = _room_id AND m.user_id = _user_id AND m.role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_queue_agent(_queue_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_queue_agents a
    WHERE a.queue_id = _queue_id AND a.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION private.is_chat_room_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_chat_room_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_queue_agent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_chat_room_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_chat_room_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_queue_agent(uuid, uuid) TO authenticated, service_role;

-- Recreate the policies against the private helpers
DROP POLICY IF EXISTS "Members can insert messages" ON public.chat_messages;
CREATE POLICY "Members can insert messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_chat_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members can view room messages" ON public.chat_messages;
CREATE POLICY "Members can view room messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (private.is_chat_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members can view room members" ON public.chat_room_members;
CREATE POLICY "Members can view room members" ON public.chat_room_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_chat_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members or room admins can remove members" ON public.chat_room_members;
CREATE POLICY "Members or room admins can remove members" ON public.chat_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_chat_room_admin(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members or room admins can update membership" ON public.chat_room_members;
CREATE POLICY "Members or room admins can update membership" ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.is_chat_room_admin(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR private.is_chat_room_admin(room_id, auth.uid()));

DROP POLICY IF EXISTS "Room admins can delete rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can delete rooms" ON public.chat_rooms FOR DELETE TO authenticated
  USING (private.is_chat_room_admin(id, auth.uid()) AND id <> '00000000-0000-0000-0000-000000000001'::uuid);

DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can update rooms" ON public.chat_rooms FOR UPDATE TO authenticated
  USING (private.is_chat_room_admin(id, auth.uid()))
  WITH CHECK (private.is_chat_room_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Users can view rooms they belong to" ON public.chat_rooms;
CREATE POLICY "Users can view rooms they belong to" ON public.chat_rooms FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.is_chat_room_member(id, auth.uid()));

DROP POLICY IF EXISTS "Agents and admins can update conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents and admins can update conversations" ON public.chat_queue_conversations FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR private.is_queue_agent(queue_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (assigned_to = auth.uid() OR private.is_queue_agent(queue_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Agents, admins and requester can view conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents, admins and requester can view conversations" ON public.chat_queue_conversations FOR SELECT TO authenticated
  USING (started_by = auth.uid() OR assigned_to = auth.uid() OR private.is_queue_agent(queue_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Remove the now-unused public helpers
DROP FUNCTION IF EXISTS public.is_chat_room_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_chat_room_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_queue_agent(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_room_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_room_admin(uuid, uuid);