DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['checklist-fotos','folhas-pdf','solicitacoes-vagas','relatorios','assinaturas','faltas-pdfs','faltas-planilhas','arquivos-dashboards','projeto-atualizacoes','protocolos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth_all_' || b);
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR ALL TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
      'auth_all_' || b, b, b);
  END LOOP;
END $$;