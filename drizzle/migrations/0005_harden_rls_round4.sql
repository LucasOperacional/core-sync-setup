-- Impedir que um membro comum altere o próprio papel na sala
DROP POLICY IF EXISTS "Members or room admins can update membership" ON public.chat_room_members;
CREATE POLICY chat_room_members_update_scoped ON public.chat_room_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid()))
  WITH CHECK (
    public.is_room_admin(room_id, auth.uid())
    OR (user_id = auth.uid() AND coalesce(role, 'member') = 'member')
  );

-- app_config: escrita somente para admin (remove política duplicada que incluía diretor)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='app_config'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_config', r.policyname);
  END LOOP;
END $$;

CREATE POLICY app_config_select_interno ON public.app_config
  FOR SELECT TO authenticated USING (public.tem_papel_interno(auth.uid()));
CREATE POLICY app_config_admin_write ON public.app_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
