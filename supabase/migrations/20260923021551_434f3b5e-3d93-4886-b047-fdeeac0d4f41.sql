CREATE POLICY "comercial_documentos_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'comercial-documentos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.com_eh_gestor(auth.uid())
  )
);

CREATE POLICY "comercial_documentos_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comercial-documentos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "comercial_documentos_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'comercial-documentos'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR private.com_eh_gestor(auth.uid()))
)
WITH CHECK (
  bucket_id = 'comercial-documentos'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR private.com_eh_gestor(auth.uid()))
);

CREATE POLICY "comercial_documentos_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'comercial-documentos'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR private.com_eh_gestor(auth.uid()))
);