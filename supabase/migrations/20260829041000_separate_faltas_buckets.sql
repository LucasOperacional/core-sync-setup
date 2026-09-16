-- Create a separate bucket for spreadsheet/CSV files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faltas-planilhas',
  'faltas-planilhas',
  false,
  52428800, -- 50MB
  ARRAY['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to faltas-planilhas bucket
CREATE POLICY "Authenticated users can upload faltas planilhas"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faltas-planilhas');

-- Allow authenticated users to read files from faltas-planilhas bucket
CREATE POLICY "Authenticated users can read faltas planilhas"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faltas-planilhas');

-- Allow authenticated admins to delete files from faltas-planilhas bucket
CREATE POLICY "Admins can delete faltas planilhas"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faltas-planilhas' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- Add a 'tipo' column to faltas_arquivos to differentiate PDF from spreadsheet
ALTER TABLE public.faltas_arquivos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pdf';
