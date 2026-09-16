ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES public.chat_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_conv_queue_idx ON public.whatsapp_conversations (queue_id);