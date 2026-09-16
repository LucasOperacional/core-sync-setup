ALTER TABLE public.protocolos DROP CONSTRAINT IF EXISTS protocolos_user_id_fkey;
ALTER TABLE public.protocolos
  ADD CONSTRAINT protocolos_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;