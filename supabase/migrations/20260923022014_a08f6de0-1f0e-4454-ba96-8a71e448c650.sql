INSERT INTO public.com_etapas (nome, ordem, probabilidade, tipo_final)
VALUES
  ('Novo lead', 1, 10, NULL),
  ('Primeiro contato', 2, 20, NULL),
  ('Diagnóstico', 3, 40, NULL),
  ('Proposta enviada', 4, 60, NULL),
  ('Negociação', 5, 80, NULL),
  ('Ganho', 6, 100, 'ganho'),
  ('Perdido', 7, 0, 'perdido')
ON CONFLICT (nome) DO UPDATE SET
  ordem = EXCLUDED.ordem,
  probabilidade = EXCLUDED.probabilidade,
  tipo_final = EXCLUDED.tipo_final,
  ativo = true;