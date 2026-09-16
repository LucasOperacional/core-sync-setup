CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.owns_protocolo_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protocolos p
    WHERE p.id::text = split_part(_name, '/', 1)
      AND (p.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  )
$$;
REVOKE ALL ON FUNCTION private.owns_protocolo_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owns_protocolo_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS folhas_pdf_select ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_insert ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_update ON storage.objects;
DROP POLICY IF EXISTS folhas_pdf_delete ON storage.objects;
CREATE POLICY folhas_pdf_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'folhas-pdf' AND private.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'folhas-pdf' AND private.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'folhas-pdf' AND private.owns_protocolo_path(name))
  WITH CHECK (bucket_id = 'folhas-pdf' AND private.owns_protocolo_path(name));
CREATE POLICY folhas_pdf_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'folhas-pdf' AND private.owns_protocolo_path(name));

DROP FUNCTION IF EXISTS public.owns_protocolo_path(text);