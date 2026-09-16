CREATE POLICY "wa conv delete" ON public.whatsapp_conversations FOR DELETE TO authenticated USING (tem_papel_interno(auth.uid()));
CREATE POLICY "wa msg delete" ON public.whatsapp_messages FOR DELETE TO authenticated USING (tem_papel_interno(auth.uid()));
CREATE POLICY "wa transfer delete" ON public.whatsapp_transfers FOR DELETE TO authenticated USING (tem_papel_interno(auth.uid()));