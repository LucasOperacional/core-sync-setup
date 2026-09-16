-- IA Operacional: tabelas de erros, ações de recuperação e soluções conhecidas.

-- 1. operational_errors
CREATE TABLE IF NOT EXISTS public.operational_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  page text NOT NULL DEFAULT '/',
  component text,
  error_type text NOT NULL,
  message text NOT NULL,
  technical_details text,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'recovering', 'resolved', 'failed', 'pending_review')),
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_errors ENABLE ROW LEVEL SECURITY;

-- Only admins can see operational errors
CREATE POLICY "Admin read operational_errors"
  ON public.operational_errors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- Authenticated users can insert (so error capture works from any session)
CREATE POLICY "Authenticated insert operational_errors"
  ON public.operational_errors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can update status
CREATE POLICY "Admin update operational_errors"
  ON public.operational_errors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 2. recovery_actions
CREATE TABLE IF NOT EXISTS public.recovery_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id text NOT NULL,
  action text NOT NULL,
  result text NOT NULL DEFAULT 'success'
    CHECK (result IN ('success', 'failure', 'skipped')),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  automatic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read recovery_actions"
  ON public.recovery_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated insert recovery_actions"
  ON public.recovery_actions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. known_error_solutions
CREATE TABLE IF NOT EXISTS public.known_error_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signature text NOT NULL UNIQUE,
  description text NOT NULL,
  authorized_solution text NOT NULL,
  max_retries integer NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.known_error_solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage known_error_solutions"
  ON public.known_error_solutions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );
