ALTER TABLE public.nexti_workplaces
  ADD COLUMN IF NOT EXISTS finish_date date,
  ADD COLUMN IF NOT EXISTS closing_reason text;

UPDATE public.nexti_workplaces
SET finish_date = CASE
      WHEN raw_payload->>'finishDate' ~ '^\d{14}$'
      THEN to_date(left(raw_payload->>'finishDate', 8), 'DDMMYYYY')
      ELSE NULL END,
    closing_reason = NULLIF(raw_payload->>'workplaceClosingReasonName', '');