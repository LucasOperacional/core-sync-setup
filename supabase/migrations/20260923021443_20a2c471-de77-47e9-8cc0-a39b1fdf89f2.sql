CREATE OR REPLACE FUNCTION public.com_eh_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  )
$$;
REVOKE ALL ON FUNCTION public.com_eh_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_eh_admin(uuid) TO authenticated, service_role;

CREATE TABLE public.com_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text,
  cidade text,
  uf text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_unidades TO authenticated;
GRANT ALL ON public.com_unidades TO service_role;
ALTER TABLE public.com_unidades ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.com_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  papel text NOT NULL DEFAULT 'vendedor' CHECK (papel IN ('gestor', 'vendedor')),
  unidade_id uuid REFERENCES public.com_unidades(id) ON DELETE SET NULL,
  gestor_id uuid REFERENCES public.com_equipe(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_equipe TO authenticated;
GRANT ALL ON public.com_equipe TO service_role;
ALTER TABLE public.com_equipe ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.com_eh_gestor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.com_eh_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.com_equipe
    WHERE user_id = _user_id AND papel = 'gestor' AND ativo
  )
$$;
REVOKE ALL ON FUNCTION public.com_eh_gestor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_eh_gestor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.com_pode_ver_responsavel(_responsavel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.com_eh_gestor(_user_id) OR _responsavel_id = _user_id
$$;
REVOKE ALL ON FUNCTION public.com_pode_ver_responsavel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_pode_ver_responsavel(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "com_unidades_read" ON public.com_unidades FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.com_equipe e WHERE e.user_id = auth.uid() AND e.ativo) OR public.com_eh_admin(auth.uid()));
CREATE POLICY "com_unidades_manage" ON public.com_unidades FOR ALL TO authenticated USING (public.com_eh_gestor(auth.uid())) WITH CHECK (public.com_eh_gestor(auth.uid()));
CREATE POLICY "com_equipe_read" ON public.com_equipe FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.com_eh_gestor(auth.uid()));
CREATE POLICY "com_equipe_manage" ON public.com_equipe FOR ALL TO authenticated USING (public.com_eh_admin(auth.uid())) WITH CHECK (public.com_eh_admin(auth.uid()));

CREATE TABLE public.com_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ordem integer NOT NULL,
  probabilidade integer NOT NULL DEFAULT 0 CHECK (probabilidade BETWEEN 0 AND 100),
  tipo_final text CHECK (tipo_final IN ('ganho', 'perdido')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_etapas TO authenticated;
GRANT ALL ON public.com_etapas TO service_role;
ALTER TABLE public.com_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "com_etapas_read" ON public.com_etapas FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.com_equipe e WHERE e.user_id = auth.uid() AND e.ativo) OR public.com_eh_admin(auth.uid()));
CREATE POLICY "com_etapas_manage" ON public.com_etapas FOR ALL TO authenticated USING (public.com_eh_gestor(auth.uid())) WITH CHECK (public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'potencial' CHECK (tipo IN ('potencial', 'cliente')),
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  email text,
  telefone text,
  endereco text,
  cidade text,
  uf text,
  segmento text,
  origem_lead text,
  responsavel_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.com_unidades(id) ON DELETE SET NULL,
  maps_place_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_clientes TO authenticated;
GRANT ALL ON public.com_clientes TO service_role;
ALTER TABLE public.com_clientes ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX com_clientes_cnpj_unique ON public.com_clientes(cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
CREATE UNIQUE INDEX com_clientes_maps_unique ON public.com_clientes(maps_place_id) WHERE maps_place_id IS NOT NULL AND maps_place_id <> '';
CREATE INDEX com_clientes_responsavel_idx ON public.com_clientes(responsavel_id, created_at DESC);
CREATE INDEX com_clientes_unidade_idx ON public.com_clientes(unidade_id);
CREATE POLICY "com_clientes_read" ON public.com_clientes FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_clientes_insert" ON public.com_clientes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND (responsavel_id = auth.uid() OR public.com_eh_gestor(auth.uid())));
CREATE POLICY "com_clientes_update" ON public.com_clientes FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_clientes_delete" ON public.com_clientes FOR DELETE TO authenticated USING (public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.com_clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ligacao', 'email', 'reuniao', 'mensagem', 'nota')),
  assunto text NOT NULL,
  descricao text,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  responsavel_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_interacoes TO authenticated;
GRANT ALL ON public.com_interacoes TO service_role;
ALTER TABLE public.com_interacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_interacoes_cliente_idx ON public.com_interacoes(cliente_id, ocorrido_em DESC);
CREATE POLICY "com_interacoes_read" ON public.com_interacoes FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_interacoes_insert" ON public.com_interacoes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_interacoes_update" ON public.com_interacoes FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_interacoes_delete" ON public.com_interacoes FOR DELETE TO authenticated USING (responsavel_id = auth.uid() OR public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.com_clientes(id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES public.com_etapas(id),
  titulo text NOT NULL,
  valor_previsto numeric(14,2) NOT NULL DEFAULT 0,
  probabilidade integer NOT NULL DEFAULT 0 CHECK (probabilidade BETWEEN 0 AND 100),
  previsao_fechamento date,
  responsavel_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.com_unidades(id) ON DELETE SET NULL,
  motivo_perda text,
  ganho_em timestamptz,
  perdido_em timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_oportunidades TO authenticated;
GRANT ALL ON public.com_oportunidades TO service_role;
ALTER TABLE public.com_oportunidades ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_oportunidades_etapa_idx ON public.com_oportunidades(etapa_id, updated_at DESC);
CREATE INDEX com_oportunidades_responsavel_idx ON public.com_oportunidades(responsavel_id, created_at DESC);
CREATE INDEX com_oportunidades_cliente_idx ON public.com_oportunidades(cliente_id);
CREATE POLICY "com_oportunidades_read" ON public.com_oportunidades FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_oportunidades_insert" ON public.com_oportunidades FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_oportunidades_update" ON public.com_oportunidades FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_oportunidades_delete" ON public.com_oportunidades FOR DELETE TO authenticated USING (responsavel_id = auth.uid() OR public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES public.com_oportunidades(id) ON DELETE CASCADE,
  numero text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'recusada', 'expirada')),
  versao_atual integer NOT NULL DEFAULT 1,
  valor_mensal numeric(14,2) NOT NULL DEFAULT 0,
  prazo_meses integer NOT NULL DEFAULT 12,
  validade_ate date,
  responsavel_id uuid NOT NULL,
  enviada_em timestamptz,
  aprovada_em timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_propostas TO authenticated;
GRANT ALL ON public.com_propostas TO service_role;
ALTER TABLE public.com_propostas ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_propostas_oportunidade_idx ON public.com_propostas(oportunidade_id);
CREATE INDEX com_propostas_responsavel_idx ON public.com_propostas(responsavel_id, created_at DESC);
CREATE POLICY "com_propostas_read" ON public.com_propostas FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_propostas_insert" ON public.com_propostas FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_propostas_update" ON public.com_propostas FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_propostas_delete" ON public.com_propostas FOR DELETE TO authenticated USING (responsavel_id = auth.uid() OR public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_proposta_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.com_propostas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  custo_total numeric(14,2) NOT NULL DEFAULT 0,
  margem_percentual numeric(7,3) NOT NULL DEFAULT 0,
  impostos_percentual numeric(7,3) NOT NULL DEFAULT 0,
  valor_mensal numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposta_id, versao)
);
GRANT SELECT, INSERT ON public.com_proposta_versoes TO authenticated;
GRANT ALL ON public.com_proposta_versoes TO service_role;
ALTER TABLE public.com_proposta_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "com_proposta_versoes_read" ON public.com_proposta_versoes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.com_propostas p WHERE p.id = proposta_id AND public.com_pode_ver_responsavel(p.responsavel_id, auth.uid())));
CREATE POLICY "com_proposta_versoes_insert" ON public.com_proposta_versoes FOR INSERT TO authenticated WITH CHECK (criado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.com_propostas p WHERE p.id = proposta_id AND public.com_pode_ver_responsavel(p.responsavel_id, auth.uid())));

CREATE TABLE public.com_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.com_clientes(id) ON DELETE CASCADE,
  oportunidade_id uuid REFERENCES public.com_oportunidades(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('tarefa', 'reuniao', 'retorno', 'lembrete')),
  titulo text NOT NULL,
  descricao text,
  inicio_em timestamptz NOT NULL,
  concluida_em timestamptz,
  responsavel_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_atividades TO authenticated;
GRANT ALL ON public.com_atividades TO service_role;
ALTER TABLE public.com_atividades ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_atividades_responsavel_data_idx ON public.com_atividades(responsavel_id, inicio_em);
CREATE POLICY "com_atividades_read" ON public.com_atividades FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_atividades_insert" ON public.com_atividades FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_atividades_update" ON public.com_atividades FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_atividades_delete" ON public.com_atividades FOR DELETE TO authenticated USING (responsavel_id = auth.uid() OR public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL UNIQUE REFERENCES public.com_propostas(id),
  cliente_id uuid NOT NULL REFERENCES public.com_clientes(id),
  numero text NOT NULL UNIQUE,
  inicio date NOT NULL,
  fim date NOT NULL,
  valor_mensal numeric(14,2) NOT NULL,
  indice_reajuste text,
  proximo_reajuste date,
  documento_path text,
  responsavel_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'implantacao' CHECK (status IN ('implantacao', 'ativo', 'encerrado', 'cancelado')),
  implantacao_status text NOT NULL DEFAULT 'pendente' CHECK (implantacao_status IN ('pendente', 'enviado', 'recebido', 'concluido')),
  implantacao_enviada_em timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.com_contratos TO authenticated;
GRANT ALL ON public.com_contratos TO service_role;
ALTER TABLE public.com_contratos ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_contratos_responsavel_idx ON public.com_contratos(responsavel_id, fim);
CREATE INDEX com_contratos_fim_idx ON public.com_contratos(fim) WHERE status = 'ativo';
CREATE POLICY "com_contratos_read" ON public.com_contratos FOR SELECT TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_contratos_insert" ON public.com_contratos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_contratos_update" ON public.com_contratos FOR UPDATE TO authenticated USING (public.com_pode_ver_responsavel(responsavel_id, auth.uid())) WITH CHECK (public.com_pode_ver_responsavel(responsavel_id, auth.uid()));
CREATE POLICY "com_contratos_delete" ON public.com_contratos FOR DELETE TO authenticated USING (public.com_eh_gestor(auth.uid()));

CREATE TABLE public.com_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.com_auditoria TO authenticated;
GRANT ALL ON public.com_auditoria TO service_role;
ALTER TABLE public.com_auditoria ENABLE ROW LEVEL SECURITY;
CREATE INDEX com_auditoria_entidade_idx ON public.com_auditoria(entidade, entidade_id, created_at DESC);
CREATE POLICY "com_auditoria_read" ON public.com_auditoria FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.com_eh_gestor(auth.uid()));
CREATE POLICY "com_auditoria_insert" ON public.com_auditoria FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.com_validar_oportunidade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_tipo text;
BEGIN
  SELECT tipo_final INTO v_tipo FROM public.com_etapas WHERE id = NEW.etapa_id;
  IF v_tipo = 'perdido' AND coalesce(trim(NEW.motivo_perda), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da perda.';
  END IF;
  IF v_tipo = 'ganho' AND NEW.ganho_em IS NULL THEN NEW.ganho_em = now(); END IF;
  IF v_tipo = 'perdido' AND NEW.perdido_em IS NULL THEN NEW.perdido_em = now(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER com_validar_oportunidade_trigger BEFORE INSERT OR UPDATE ON public.com_oportunidades FOR EACH ROW EXECUTE FUNCTION public.com_validar_oportunidade();

CREATE TRIGGER com_unidades_updated_at BEFORE UPDATE ON public.com_unidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_equipe_updated_at BEFORE UPDATE ON public.com_equipe FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_etapas_updated_at BEFORE UPDATE ON public.com_etapas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_clientes_updated_at BEFORE UPDATE ON public.com_clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_interacoes_updated_at BEFORE UPDATE ON public.com_interacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_oportunidades_updated_at BEFORE UPDATE ON public.com_oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_propostas_updated_at BEFORE UPDATE ON public.com_propostas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_atividades_updated_at BEFORE UPDATE ON public.com_atividades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER com_contratos_updated_at BEFORE UPDATE ON public.com_contratos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();