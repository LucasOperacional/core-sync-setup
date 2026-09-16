-- 1) Auditoria de acesso a documentos SEM registrar conteúdo
CREATE OR REPLACE FUNCTION public.privacidade_registrar_acesso(
  _modulo text,
  _acao text,
  _finalidade text DEFAULT NULL,
  _referencia_interna text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lgpd_acessos (user_id, modulo, acao, finalidade, base_legal, titular_ref)
  VALUES (
    auth.uid(),
    left(coalesce(_modulo, 'desconhecido'), 60),
    left(coalesce(_acao, 'leitura'), 60),
    left(coalesce(_finalidade, 'execucao_contrato'), 200),
    'obrigacao_legal',
    left(coalesce(_referencia_interna, ''), 64)
  );
EXCEPTION WHEN others THEN
  -- auditoria nunca interrompe a operação do usuário
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.privacidade_registrar_acesso(text, text, text, text) TO service_role;

-- 2) Expurgo automático de dados que não são mais necessários
CREATE OR REPLACE FUNCTION public.privacidade_expurgar_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _retencao_logs integer := 180;
  _retencao_chat integer := 365;
  _apagados jsonb := '{}'::jsonb;
  _n integer;
BEGIN
  SELECT coalesce(retencao_logs_dias, 180), coalesce(retencao_chat_dias, 365)
    INTO _retencao_logs, _retencao_chat
  FROM public.lgpd_config
  LIMIT 1;

  DELETE FROM public.security_api_events
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('security_api_events', _n);

  DELETE FROM public.security_audit_log
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('security_audit_log', _n);

  DELETE FROM public.lgpd_acessos
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('lgpd_acessos', _n);

  DELETE FROM public.rastreamento_localizacoes
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('rastreamento_localizacoes', _n);

  DELETE FROM public.security_rate_limits
   WHERE updated_at < now() - interval '7 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('security_rate_limits', _n);

  DELETE FROM public.security_blocklist
   WHERE blocked_until < now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('security_blocklist', _n);

  DELETE FROM public.operational_errors
   WHERE created_at < now() - make_interval(days => _retencao_logs);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _apagados := _apagados || jsonb_build_object('operational_errors', _n);

  RETURN jsonb_build_object('executado_em', now(), 'apagados', _apagados);
END;
$$;

REVOKE ALL ON FUNCTION public.privacidade_expurgar_dados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacidade_expurgar_dados() TO service_role;