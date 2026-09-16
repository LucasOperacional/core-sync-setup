ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'diretor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cordenador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mesa_operacional';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nxs_role') THEN
    CREATE TYPE public.nxs_role AS ENUM ('admin_geral','admin_empresa','gestor','supervisor','operador','colaborador','cliente');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nxs_device_status') THEN
    CREATE TYPE public.nxs_device_status AS ENUM ('online','offline','sem_sinal','manutencao','inativo','bloqueado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nxs_alert_status') THEN
    CREATE TYPE public.nxs_alert_status AS ENUM ('novo','reconhecido','em_atendimento','resolvido','falso_positivo','cancelado');
  END IF;
END $$;