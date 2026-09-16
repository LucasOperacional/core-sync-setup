-- Recreate faltas-planilhas bucket with broader mime types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faltas-planilhas',
  'faltas-planilhas',
  false,
  52428800,
  ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream','text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream','text/plain'],
  file_size_limit = 52428800;

-- Also ensure faltas-pdfs accepts octet-stream
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faltas-pdfs',
  'faltas-pdfs',
  false,
  52428800,
  ARRAY['application/pdf','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = ARRAY['application/pdf','application/octet-stream'],
  file_size_limit = 52428800;

-- Drop existing policies if they exist to avoid conflicts, then recreate
DO $$
BEGIN
  -- faltas-planilhas policies
  DROP POLICY IF EXISTS "Authenticated users can upload faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can read faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete faltas planilhas" ON storage.objects;
  DROP POLICY IF EXISTS "Auth users can delete faltas planilhas" ON storage.objects;

  -- faltas-pdfs policies (recreate to be safe)
  DROP POLICY IF EXISTS "Authenticated users can upload faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can read faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete faltas files" ON storage.objects;
  DROP POLICY IF EXISTS "Auth users can delete faltas pdfs" ON storage.objects;
END
$$;

-- Policies for faltas-planilhas
CREATE POLICY "Authenticated users can upload faltas planilhas"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-planilhas');

CREATE POLICY "Authenticated users can read faltas planilhas"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-planilhas');

CREATE POLICY "Auth users can delete faltas planilhas"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-planilhas');

-- Policies for faltas-pdfs
CREATE POLICY "Authenticated users can upload faltas files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-pdfs');

CREATE POLICY "Authenticated users can read faltas files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-pdfs');

CREATE POLICY "Auth users can delete faltas pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-pdfs');

-- Ensure tipo column exists
ALTER TABLE public.faltas_arquivos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pdf';
