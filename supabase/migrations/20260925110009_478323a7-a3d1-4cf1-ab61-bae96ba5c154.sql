CREATE OR REPLACE FUNCTION private.tem_papel_app(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION private.pnt_tem_acesso(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.pnt_eh_gestor(_user_id)
    OR public.pnt_meu_funcionario(_user_id) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.pnt_members m WHERE m.user_id = _user_id)
  )
$$;
REVOKE ALL ON FUNCTION private.tem_papel_app(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.pnt_tem_acesso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.tem_papel_app(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pnt_tem_acesso(uuid) TO authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Chat
DROP POLICY IF EXISTS "Authenticated users can insert queue conversations" ON public.chat_queue_conversations;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.chat_rooms;
CREATE POLICY "Authenticated users can create rooms" ON public.chat_rooms
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Ponto: registros de auditoria/aprovação
DROP POLICY IF EXISTS "pnt_aprovacoes_registro" ON public.pnt_approval_history;
CREATE POLICY "pnt_aprovacoes_registro" ON public.pnt_approval_history
  FOR INSERT TO authenticated WITH CHECK (responsavel = auth.uid());
DROP POLICY IF EXISTS "pnt_auditoria_registro" ON public.pnt_audit_logs;
CREATE POLICY "pnt_auditoria_registro" ON public.pnt_audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Ponto: decisão de ajustes
DROP POLICY IF EXISTS "pnt_ajustes_decidir" ON public.pnt_time_adjustment_requests;
CREATE POLICY "pnt_ajustes_decidir" ON public.pnt_time_adjustment_requests
  FOR UPDATE TO authenticated
  USING (pnt_pode_ver_funcionario(employee_id, auth.uid()) AND (pnt_eh_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.pnt_employees e WHERE e.id = pnt_time_adjustment_requests.employee_id AND e.supervisor_user_id = auth.uid())))
  WITH CHECK (pnt_pode_ver_funcionario(employee_id, auth.uid()) AND (pnt_eh_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.pnt_employees e WHERE e.id = pnt_time_adjustment_requests.employee_id AND e.supervisor_user_id = auth.uid())));

-- Ponto: tabelas de referência apenas para quem participa do ponto
DROP POLICY IF EXISTS "pnt_work_schedules_leitura" ON public.pnt_work_schedules;
CREATE POLICY "pnt_work_schedules_leitura" ON public.pnt_work_schedules FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_geofences_leitura" ON public.pnt_geofences;
CREATE POLICY "pnt_geofences_leitura" ON public.pnt_geofences FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_companies_leitura" ON public.pnt_companies;
CREATE POLICY "pnt_companies_leitura" ON public.pnt_companies FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_organizations_leitura" ON public.pnt_organizations;
CREATE POLICY "pnt_organizations_leitura" ON public.pnt_organizations FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_units_leitura" ON public.pnt_units;
CREATE POLICY "pnt_units_leitura" ON public.pnt_units FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_holidays_leitura" ON public.pnt_holidays;
CREATE POLICY "pnt_holidays_leitura" ON public.pnt_holidays FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_periodos_leitura" ON public.pnt_payroll_periods;
CREATE POLICY "pnt_periodos_leitura" ON public.pnt_payroll_periods FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));
DROP POLICY IF EXISTS "pnt_settings_leitura" ON public.pnt_settings;
CREATE POLICY "pnt_settings_leitura" ON public.pnt_settings FOR SELECT TO authenticated USING (private.pnt_tem_acesso(auth.uid()));

-- LGPD
DROP POLICY IF EXISTS "lgpd_config_read" ON public.lgpd_config;
CREATE POLICY "lgpd_config_read" ON public.lgpd_config FOR SELECT TO authenticated USING (private.tem_papel_app(auth.uid()));

-- Mesa operacional: somente usuários com papel atribuído no sistema
DROP POLICY IF EXISTS "mesa_postos_escrita" ON public.mesa_postos_servico;
DROP POLICY IF EXISTS "mesa_postos_leitura" ON public.mesa_postos_servico;
CREATE POLICY "mesa_postos_leitura" ON public.mesa_postos_servico FOR SELECT TO authenticated USING (private.tem_papel_app(auth.uid()));
CREATE POLICY "mesa_postos_escrita" ON public.mesa_postos_servico FOR ALL TO authenticated USING (private.tem_papel_app(auth.uid())) WITH CHECK (private.tem_papel_app(auth.uid()));

DROP POLICY IF EXISTS "mesa_checkins_escrita" ON public.mesa_checkins;
DROP POLICY IF EXISTS "mesa_checkins_leitura" ON public.mesa_checkins;
CREATE POLICY "mesa_checkins_leitura" ON public.mesa_checkins FOR SELECT TO authenticated USING (private.tem_papel_app(auth.uid()));
CREATE POLICY "mesa_checkins_escrita" ON public.mesa_checkins FOR ALL TO authenticated USING (private.tem_papel_app(auth.uid())) WITH CHECK (private.tem_papel_app(auth.uid()));

DROP POLICY IF EXISTS "Usuários logados apagam relatórios" ON public.mesa_relatorios;
DROP POLICY IF EXISTS "Usuários logados atualizam relatórios" ON public.mesa_relatorios;
DROP POLICY IF EXISTS "Usuários logados registram relatórios" ON public.mesa_relatorios;
DROP POLICY IF EXISTS "Usuários logados veem relatórios" ON public.mesa_relatorios;
CREATE POLICY "Usuários com papel veem relatórios" ON public.mesa_relatorios FOR SELECT TO authenticated USING (private.tem_papel_app(auth.uid()));
CREATE POLICY "Usuários com papel registram relatórios" ON public.mesa_relatorios FOR INSERT TO authenticated WITH CHECK (private.tem_papel_app(auth.uid()));
CREATE POLICY "Usuários com papel atualizam relatórios" ON public.mesa_relatorios FOR UPDATE TO authenticated USING (private.tem_papel_app(auth.uid())) WITH CHECK (private.tem_papel_app(auth.uid()));
CREATE POLICY "Usuários com papel apagam relatórios" ON public.mesa_relatorios FOR DELETE TO authenticated USING (private.tem_papel_app(auth.uid()));