CREATE INDEX IF NOT EXISTS funcionarios_ativos_ativo_empresa_nome_idx ON public.funcionarios_ativos (ativo, empresa, nome);
CREATE INDEX IF NOT EXISTS nexti_persons_workplace_idx ON public.nexti_persons (workplace_id);
CREATE INDEX IF NOT EXISTS nexti_persons_situacao_idx ON public.nexti_persons (situacao_id);
CREATE INDEX IF NOT EXISTS nexti_workplaces_name_idx ON public.nexti_workplaces (name);
CREATE INDEX IF NOT EXISTS visitas_created_at_idx ON public.visitas (created_at DESC);