import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { LgpdConsentBanner } from "@/components/LgpdConsentBanner";
import { RastreioAutomaticoPosto } from "@/components/RastreioAutomaticoPosto";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // This protected layout is client-only. Avoid importing/evaluating the
    // browser Supabase client while the server router is building routes.
    if (typeof window === "undefined") {
      return { user: null };
    }

    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // Instant local read first — avoids a network round-trip on every
      // navigation. Falls back to getUser() when there is no local session.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user ?? null;

      if (sessionUser) {
        const { ensureUserProfiles } = await import("@/lib/ensure-profile");
        void ensureUserProfiles(sessionUser);
        return { user: sessionUser };
      }

      const { data, error } = await supabase.auth.getUser();

      if (!error && data.user) {
        const { ensureUserProfiles } = await import("@/lib/ensure-profile");
        void ensureUserProfiles(data.user);
        return { user: data.user };
      }

      if (error) {
        console.warn("[Auth] User verification failed:", error.message);
      }
    } catch (error) {
      console.error("[Auth] Failed to verify user:", error);
    }

    throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <RastreioAutomaticoPosto />
      <LgpdConsentBanner />
    </>
  );
}
