GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_chat_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = _room_id AND m.user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_chat_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
DROP POLICY IF EXISTS "Members or room admins can remove members" ON public.chat_room_members;
CREATE POLICY "Members or room admins can remove members" ON public.chat_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members or room admins can update membership" ON public.chat_room_members;
CREATE POLICY "Members or room admins can update membership" ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_chat_room_admin(room_id, auth.uid()));
GRANT UPDATE ON public.chat_room_members TO authenticated;

DROP POLICY IF EXISTS "Users can view rooms they belong to" ON public.chat_rooms;
CREATE POLICY "Users can view rooms they belong to" ON public.chat_rooms FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_chat_room_member(id, auth.uid()));

DROP POLICY IF EXISTS "Room admins can update rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can update rooms" ON public.chat_rooms FOR UPDATE TO authenticated
  USING (public.is_chat_room_admin(id, auth.uid()))
  WITH CHECK (public.is_chat_room_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Room admins can delete rooms" ON public.chat_rooms;
CREATE POLICY "Room admins can delete rooms" ON public.chat_rooms FOR DELETE TO authenticated
  USING (public.is_chat_room_admin(id, auth.uid()) AND id <> '00000000-0000-0000-0000-000000000001'::uuid);
GRANT DELETE ON public.chat_rooms TO authenticated;

DROP POLICY IF EXISTS "Members can view room messages" ON public.chat_messages;
CREATE POLICY "Members can view room messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Members can insert messages" ON public.chat_messages;
CREATE POLICY "Members can insert messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Queue agents and admins can view conversations" ON public.chat_queue_conversations;
DROP POLICY IF EXISTS "Agents, admins and requester can view conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents, admins and requester can view conversations" ON public.chat_queue_conversations FOR SELECT TO authenticated
  USING (started_by = auth.uid() OR assigned_to = auth.uid()
    OR public.is_queue_agent(queue_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Queue agents and admins can update conversations" ON public.chat_queue_conversations;
DROP POLICY IF EXISTS "Agents and admins can update conversations" ON public.chat_queue_conversations;
CREATE POLICY "Agents and admins can update conversations" ON public.chat_queue_conversations FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.is_queue_agent(queue_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (assigned_to = auth.uid() OR public.is_queue_agent(queue_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can insert queue conversations" ON public.chat_queue_conversations;
DROP POLICY IF EXISTS "Users can open queue conversations" ON public.chat_queue_conversations;
CREATE POLICY "Users can open queue conversations" ON public.chat_queue_conversations FOR INSERT TO authenticated
  WITH CHECK (started_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity, resource)
);
GRANT SELECT ON public.security_rate_limits TO authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_rate_limits" ON public.security_rate_limits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity)
);
GRANT SELECT ON public.security_blocklist TO authenticated;
GRANT ALL ON public.security_blocklist TO service_role;
ALTER TABLE public.security_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_blocklist" ON public.security_blocklist FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_api_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  card_key text NOT NULL,
  resource text NOT NULL,
  outcome text NOT NULL,
  http_status integer,
  latency_ms integer,
  message text,
  severity text NOT NULL DEFAULT 'low',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_api_events_created_at_idx ON public.security_api_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_api_events_card_idx ON public.security_api_events (card_key);
GRANT SELECT, INSERT ON public.security_api_events TO authenticated;
GRANT ALL ON public.security_api_events TO service_role;
ALTER TABLE public.security_api_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_insert_own_api_events" ON public.security_api_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "users_read_own_api_events" ON public.security_api_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins_read_api_events" ON public.security_api_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.security_check_rate_limit(
  _identity text, _resource text, _limit integer, _window_seconds integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now timestamptz := now();
  _row public.security_rate_limits;
  _blocked public.security_blocklist;
  _count integer;
BEGIN
  SELECT * INTO _blocked FROM public.security_blocklist WHERE identity = _identity AND blocked_until > _now LIMIT 1;
  IF _blocked.id IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'blocked', true, 'reason', _blocked.reason,
      'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_blocked.blocked_until - _now)))::int),
      'count', 0, 'limit', _limit);
  END IF;

  INSERT INTO public.security_rate_limits (identity, resource, window_start, request_count, updated_at)
  VALUES (_identity, _resource, _now, 1, _now)
  ON CONFLICT (identity, resource) DO UPDATE
    SET request_count = CASE WHEN public.security_rate_limits.window_start < _now - make_interval(secs => _window_seconds) THEN 1 ELSE public.security_rate_limits.request_count + 1 END,
        window_start = CASE WHEN public.security_rate_limits.window_start < _now - make_interval(secs => _window_seconds) THEN _now ELSE public.security_rate_limits.window_start END,
        updated_at = _now
  RETURNING * INTO _row;

  _count := _row.request_count;

  IF _count > _limit THEN
    INSERT INTO public.security_blocklist (identity, reason, severity, blocked_until)
    VALUES (_identity, format('Excesso de chamadas em %s (%s/%s por %ss)', _resource, _count, _limit, _window_seconds), 'high', _now + make_interval(secs => _window_seconds))
    ON CONFLICT (identity) DO UPDATE SET reason = EXCLUDED.reason, severity = EXCLUDED.severity, blocked_until = EXCLUDED.blocked_until, created_at = _now;
    RETURN jsonb_build_object('allowed', false, 'blocked', true,
      'reason', format('Limite de %s chamadas por %ss excedido em %s', _limit, _window_seconds, _resource),
      'retry_after_seconds', _window_seconds, 'count', _count, 'limit', _limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'blocked', false, 'count', _count, 'limit', _limit, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, integer, integer) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.nexti_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  name text,
  checklist_type_id integer,
  status_id integer,
  start_date_time timestamptz,
  finish_date_time timestamptz,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  workplace_ids bigint[] NOT NULL DEFAULT '{}',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nexti_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nexti_id bigint NOT NULL UNIQUE,
  checklist_id bigint,
  checklist_name text,
  checklist_type_id integer,
  person_id bigint,
  supervisor_nome text,
  workplace_id bigint,
  workplace_name text,
  cliente text,
  cidade text,
  uf text,
  answer_date timestamptz,
  reference_date date,
  register_date timestamptz,
  device_code text,
  total_perguntas integer NOT NULL DEFAULT 0,
  conformes integer NOT NULL DEFAULT 0,
  nao_conformes integer NOT NULL DEFAULT 0,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexti_checklist_answers_date_idx ON public.nexti_checklist_answers (answer_date DESC);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_workplace_idx ON public.nexti_checklist_answers (workplace_id);
CREATE INDEX IF NOT EXISTS nexti_checklist_answers_person_idx ON public.nexti_checklist_answers (person_id);

GRANT SELECT ON public.nexti_checklists TO authenticated;
GRANT ALL ON public.nexti_checklists TO service_role;
GRANT SELECT ON public.nexti_checklist_answers TO authenticated;
GRANT ALL ON public.nexti_checklist_answers TO service_role;

ALTER TABLE public.nexti_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexti_checklist_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem checklists" ON public.nexti_checklists;
CREATE POLICY "Autenticados leem checklists" ON public.nexti_checklists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers;
CREATE POLICY "Autenticados leem respostas de checklist" ON public.nexti_checklist_answers
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS nexti_checklists_updated_at ON public.nexti_checklists;
CREATE TRIGGER nexti_checklists_updated_at BEFORE UPDATE ON public.nexti_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS nexti_checklist_answers_updated_at ON public.nexti_checklist_answers;
CREATE TRIGGER nexti_checklist_answers_updated_at BEFORE UPDATE ON public.nexti_checklist_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_rooms','chat_room_members','chat_messages','chat_message_reads','chat_queues','chat_queue_agents','chat_queue_conversations','user_profiles','nexti_persons','nexti_absences','nexti_clockings','nexti_documents','nexti_sync_runs','nexti_workplaces','nexti_checklist_answers']
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