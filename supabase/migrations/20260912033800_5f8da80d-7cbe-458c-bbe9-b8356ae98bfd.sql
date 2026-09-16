DO $$ BEGIN
  ALTER TABLE public.assinatura_signatarios ADD CONSTRAINT assinatura_signatarios_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.assinatura_documentos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_message_reads ADD CONSTRAINT chat_message_reads_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_queue_agents ADD CONSTRAINT chat_queue_agents_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.chat_queues(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_queue_conversations ADD CONSTRAINT chat_queue_conversations_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.chat_queues(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_queue_conversations ADD CONSTRAINT chat_queue_conversations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.chat_room_members ADD CONSTRAINT chat_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.dados_extraidos_verificacao ADD CONSTRAINT dados_extraidos_verificacao_atestado_id_fkey FOREIGN KEY (atestado_id) REFERENCES public.atestados_verificados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.historico_analises_atestado ADD CONSTRAINT historico_analises_atestado_atestado_id_fkey FOREIGN KEY (atestado_id) REFERENCES public.atestados_verificados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.inconsistencias_atestado ADD CONSTRAINT inconsistencias_atestado_atestado_id_fkey FOREIGN KEY (atestado_id) REFERENCES public.atestados_verificados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.logs_acesso_atestado ADD CONSTRAINT logs_acesso_atestado_atestado_id_fkey FOREIGN KEY (atestado_id) REFERENCES public.atestados_verificados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.monitoring_pings ADD CONSTRAINT monitoring_pings_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.monitoring_tokens(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.nexti_sync_errors ADD CONSTRAINT nexti_sync_errors_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.nexti_sync_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.protocolo_arquivos ADD CONSTRAINT protocolo_arquivos_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.protocolo_folhas ADD CONSTRAINT protocolo_folhas_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.protocolo_ponto_itens ADD CONSTRAINT protocolo_ponto_itens_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos_ponto(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.protocolos ADD CONSTRAINT protocolos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.validacoes_atestado ADD CONSTRAINT validacoes_atestado_atestado_id_fkey FOREIGN KEY (atestado_id) REFERENCES public.atestados_verificados(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.visitas ADD CONSTRAINT visitas_gerente_id_fkey FOREIGN KEY (gerente_id) REFERENCES public.gerentes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;