ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_atualizada_em timestamptz;