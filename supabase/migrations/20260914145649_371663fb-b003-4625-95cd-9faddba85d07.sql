CREATE TABLE IF NOT EXISTS public.push_agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  event_type text NOT NULL DEFAULT 'aviso_agendado',
  title text,
  body text,
  target_url text,
  publico text NOT NULL DEFAULT 'supervisores',
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  agendado_para timestamptz NOT NULL,
  repeticao text NOT NULL DEFAULT 'unica',
  status text NOT NULL DEFAULT 'agendado',
  ultimo_envio_em timestamptz,
  proximo_envio_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_agendamentos_publico_check CHECK (publico IN ('supervisores','selecionados','todos')),
  CONSTRAINT push_agendamentos_repeticao_check CHECK (repeticao IN ('unica','diaria','semanal')),
  CONSTRAINT push_agendamentos_status_check CHECK (status IN ('agendado','enviado','cancelado','falhou'))
);

CREATE INDEX IF NOT EXISTS push_agendamentos_pendentes_idx
  ON public.push_agendamentos (proximo_envio_em)
  WHERE status = 'agendado';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_agendamentos TO authenticated;
GRANT ALL ON public.push_agendamentos TO service_role;

ALTER TABLE public.push_agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam avisos agendados" ON public.push_agendamentos;
CREATE POLICY "Admins gerenciam avisos agendados"
  ON public.push_agendamentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS push_agendamentos_updated_at ON public.push_agendamentos;
CREATE TRIGGER push_agendamentos_updated_at
  BEFORE UPDATE ON public.push_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.push_agendamentos SET proximo_envio_em = agendado_para WHERE proximo_envio_em IS NULL;