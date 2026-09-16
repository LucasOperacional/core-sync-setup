CREATE POLICY "projeto_atualizacoes_objects_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'projeto-atualizacoes');
CREATE POLICY "projeto_atualizacoes_objects_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'projeto-atualizacoes');
CREATE POLICY "projeto_atualizacoes_objects_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'projeto-atualizacoes');
CREATE POLICY "projeto_atualizacoes_objects_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'projeto-atualizacoes');