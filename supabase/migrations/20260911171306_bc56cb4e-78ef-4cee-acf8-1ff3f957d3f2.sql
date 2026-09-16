DROP POLICY IF EXISTS "vagas objects own" ON storage.objects;
CREATE POLICY "vagas objects own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'solicitacoes-vagas' AND owner = auth.uid());
DROP POLICY IF EXISTS "vagas objects read" ON storage.objects;
CREATE POLICY "vagas objects read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'solicitacoes-vagas'
    AND (
      owner = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'diretor'::public.app_role)
      OR private.has_role(auth.uid(), 'cordenador'::public.app_role)
    )
  );