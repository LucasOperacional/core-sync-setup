DROP POLICY IF EXISTS nexti_workplaces_select ON public.nexti_workplaces;
CREATE POLICY nexti_workplaces_select ON public.nexti_workplaces FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'visualizador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'cordenador'::app_role)
  OR has_role(auth.uid(), 'mesa_operacional'::app_role)
);