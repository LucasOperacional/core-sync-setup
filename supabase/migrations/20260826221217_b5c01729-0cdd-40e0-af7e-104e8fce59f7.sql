CREATE TABLE public.canais_drm (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, url text NOT NULL, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pendente', latencia_ms integer, ultima_verificacao timestamptz, erro_verificacao text, criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.canais_drm TO authenticated;
GRANT ALL ON public.canais_drm TO service_role;
ALTER TABLE public.canais_drm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários autenticados podem consultar canais" ON public.canais_drm FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores podem gerenciar canais" ON public.canais_drm FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER update_canais_drm_updated_at BEFORE UPDATE ON public.canais_drm FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();