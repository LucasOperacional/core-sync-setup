DROP POLICY IF EXISTS "Authenticated users can read own atestados verification" ON storage.objects;

CREATE POLICY "Users read own atestados verification"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'atestados-verificacao'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.atestados_verificados av
      WHERE av.caminho_storage = storage.objects.name
        AND av.user_id = auth.uid()
    )
  )
);