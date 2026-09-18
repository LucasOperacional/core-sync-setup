DROP POLICY IF EXISTS funcionarios_ativos_select ON public.funcionarios_ativos;
CREATE POLICY funcionarios_ativos_select ON public.funcionarios_ativos
FOR SELECT TO authenticated
USING (public.tem_papel_interno(auth.uid()));
GRANT SELECT ON public.funcionarios_ativos TO authenticated;