REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_check_rate_limit(text, text, numeric, numeric) TO service_role;
REVOKE ALL ON TABLE public.security_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.security_rate_limits TO service_role;
DROP POLICY IF EXISTS "security_rate_limits_service_only" ON public.security_rate_limits;
CREATE POLICY "security_rate_limits_service_only" ON public.security_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);