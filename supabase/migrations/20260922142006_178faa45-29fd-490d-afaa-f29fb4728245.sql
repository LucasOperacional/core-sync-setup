CREATE TABLE public.wa_lembrete_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  texto text not null,
  criado_por uuid,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_lembrete_templates TO authenticated;
GRANT ALL ON public.wa_lembrete_templates TO service_role;
ALTER TABLE public.wa_lembrete_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe interna usa templates de lembrete" ON public.wa_lembrete_templates FOR ALL TO authenticated USING (public.tem_papel_interno(auth.uid())) WITH CHECK (public.tem_papel_interno(auth.uid()));

CREATE TABLE public.wa_lembretes (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  numeros text[] not null default '{}',
  texto text not null,
  agendado_para timestamptz not null,
  proximo_envio_em timestamptz,
  repeticao text not null default 'unica',
  status text not null default 'agendado',
  ultimo_envio_em timestamptz,
  erro text,
  criado_por uuid,
  created_at timestamptz not null default now()
);
CREATE INDEX wa_lembretes_proximo_idx ON public.wa_lembretes (proximo_envio_em) WHERE status = 'agendado';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_lembretes TO authenticated;
GRANT ALL ON public.wa_lembretes TO service_role;
ALTER TABLE public.wa_lembretes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe interna usa lembretes" ON public.wa_lembretes FOR ALL TO authenticated USING (public.tem_papel_interno(auth.uid())) WITH CHECK (public.tem_papel_interno(auth.uid()));