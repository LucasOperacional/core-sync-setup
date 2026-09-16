-- Evitar auto-promoção a admin ao entrar numa sala vazia
DROP POLICY IF EXISTS chat_room_members_insert_scoped ON public.chat_room_members;
CREATE POLICY chat_room_members_insert_scoped ON public.chat_room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_room_admin(room_id, auth.uid())
    OR (user_id = auth.uid() AND coalesce(role, 'member') = 'member')
    OR EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.id = room_id AND r.created_by = auth.uid())
  );

-- Restringir políticas atribuídas ao papel público para apenas autenticados
DO $$
DECLARE r record; stmt text; using_txt text; check_txt text;
BEGIN
  FOR r IN
    SELECT p.tablename AS tname, p.policyname AS pname, p.cmd AS command,
           p.qual AS q, p.with_check AS wc, p.permissive AS perm
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('chat_queues','chat_queue_agents','chat_queue_conversations','ai_conversations','ai_messages')
      AND p.roles = '{public}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pname, r.tname);
    using_txt := CASE WHEN r.q IS NULL THEN '' ELSE ' USING (' || r.q || ')' END;
    check_txt := CASE WHEN r.wc IS NULL THEN '' ELSE ' WITH CHECK (' || r.wc || ')' END;
    stmt := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO authenticated%s%s',
      r.pname, r.tname,
      CASE WHEN r.perm = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.command, using_txt, check_txt);
    EXECUTE stmt;
  END LOOP;
END $$;
