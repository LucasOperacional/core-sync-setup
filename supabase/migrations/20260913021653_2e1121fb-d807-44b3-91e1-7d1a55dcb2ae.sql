DO $wrap$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['relatorios','folhas-pdf','faltas-pdfs','faltas-planilhas','assinaturas','arquivos-dashboards','projeto-atualizacoes','solicitacoes-vagas','chat-attachments','checklist-fotos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_auth_select');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_auth_insert');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_auth_update');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_auth_delete');
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)', b || '_auth_select', b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)', b || '_auth_insert', b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', b || '_auth_update', b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)', b || '_auth_delete', b);
  END LOOP;
END
$wrap$;