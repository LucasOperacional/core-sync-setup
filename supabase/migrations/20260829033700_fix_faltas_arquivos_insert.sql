-- Ensure authenticated admins can INSERT into faltas_arquivos explicitly
-- (the existing ALL policy may not cover INSERT in all RLS configurations)
DO $$
BEGIN
  -- Drop the generic ALL policy and replace with explicit per-operation policies
  DROP POLICY IF EXISTS "Administradores podem gerenciar arquivos de faltas" ON public.faltas_arquivos;

  CREATE POLICY "Admins podem inserir arquivos de faltas"
    ON public.faltas_arquivos FOR INSERT TO authenticated
    WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

  CREATE POLICY "Admins podem atualizar arquivos de faltas"
    ON public.faltas_arquivos FOR UPDATE TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

  CREATE POLICY "Admins podem deletar arquivos de faltas"
    ON public.faltas_arquivos FOR DELETE TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::public.app_role));
END $$;
