CREATE TABLE public.roteiro_visita_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roteiro_id uuid NOT NULL REFERENCES public.roteiros_visita_campo(id) ON DELETE CASCADE,
  pergunta_id text NOT NULL DEFAULT '',
  pergunta_texto text NOT NULL DEFAULT '',
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  capturada_em timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  precisao_metros double precision,
  geo_status text NOT NULL DEFAULT 'indisponivel',
  observacao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiro_visita_fotos TO authenticated;
GRANT ALL ON public.roteiro_visita_fotos TO service_role;

ALTER TABLE public.roteiro_visita_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internos veem fotos das visitas"
  ON public.roteiro_visita_fotos FOR SELECT TO authenticated
  USING (public.tem_papel_interno(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Usuario registra suas fotos"
  ON public.roteiro_visita_fotos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin apaga fotos"
  ON public.roteiro_visita_fotos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());

CREATE INDEX roteiro_visita_fotos_roteiro_idx ON public.roteiro_visita_fotos(roteiro_id);

CREATE TRIGGER set_updated_at_roteiro_visita_fotos
  BEFORE UPDATE ON public.roteiro_visita_fotos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Checklist fotos leitura"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-fotos');

CREATE POLICY "Checklist fotos envio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-fotos');