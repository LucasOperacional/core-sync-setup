DROP POLICY IF EXISTS folhas_pdf_select ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_insert ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_update ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_delete ON storage.objects;
DROP FUNCTION IF EXISTS public.owns_protocolo_path(text);

CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
)
WITH CHECK (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'folhas-pdf'
  AND (
    EXISTS (
      SELECT 1 FROM public.protocolos p
      WHERE (split_part(storage.objects.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$')
        AND p.id = split_part(storage.objects.name, '/', 1)::uuid
        AND p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);