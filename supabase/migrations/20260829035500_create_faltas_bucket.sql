-- Create the storage bucket for faltas files if it does not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faltas-pdfs',
  'faltas-pdfs',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to faltas-pdfs bucket
CREATE POLICY "Authenticated users can upload faltas files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-pdfs');

-- Allow authenticated users to read files from faltas-pdfs bucket
CREATE POLICY "Authenticated users can read faltas files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-pdfs');

-- Allow authenticated admins to delete files from faltas-pdfs bucket
CREATE POLICY "Admins can delete faltas files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-pdfs' AND private.has_role(auth.uid(), 'admin'::public.app_role));
