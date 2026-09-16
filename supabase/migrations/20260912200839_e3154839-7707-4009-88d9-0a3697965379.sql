ALTER TABLE public.nxs_location_events REPLICA IDENTITY FULL;
ALTER TABLE public.nxs_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nxs_location_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nxs_alerts;