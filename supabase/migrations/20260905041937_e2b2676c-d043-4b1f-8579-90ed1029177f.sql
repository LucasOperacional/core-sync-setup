CREATE TABLE public.user_dashboard_layouts (
  user_id uuid NOT NULL,
  dashboard text NOT NULL,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dashboard)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_layouts TO authenticated;
GRANT ALL ON public.user_dashboard_layouts TO service_role;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario gerencia seu proprio layout" ON public.user_dashboard_layouts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_dashboard_layouts_updated_at BEFORE UPDATE ON public.user_dashboard_layouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();