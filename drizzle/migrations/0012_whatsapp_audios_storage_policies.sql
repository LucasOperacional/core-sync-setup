CREATE POLICY "wa audios select interno"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-audios' AND public.tem_papel_interno(auth.uid()));

CREATE POLICY "wa audios insert interno"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-audios' AND public.tem_papel_interno(auth.uid()));
