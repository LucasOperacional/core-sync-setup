DROP POLICY IF EXISTS "projeto atualizacoes objects admins" ON storage.objects;
CREATE POLICY "projeto atualizacoes objects admins" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'projeto-atualizacoes' AND private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'projeto-atualizacoes' AND private.has_role(auth.uid(), 'admin'::public.app_role));