import { supabase } from "@/integrations/supabase/client";

/**
 * Global presence: as soon as an authenticated user opens ANY page of the app,
 * they are tracked as online on a single shared channel. The channel is a
 * module-level singleton so multiple components/hooks share one subscription.
 */

type Listener = (ids: string[]) => void;

const PRESENCE_TOPIC = "app-presence";
const HEARTBEAT_MS = 60_000;

let channel: ReturnType<typeof supabase.channel> | null = null;
let starting: Promise<void> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let onlineIds: string[] = [];
let myUserId: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(onlineIds);
}

function syncFromChannel() {
  if (!channel) return;
  const state = channel.presenceState();
  onlineIds = Object.keys(state);
  emit();
}

async function touchLastSeen() {
  if (!myUserId) return;
  try {
    await supabase
      .from("user_profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", myUserId);
  } catch {
    // non-critical
  }
}

export function getOnlineUsers(): string[] {
  return onlineIds;
}

export function subscribeOnlineUsers(listener: Listener): () => void {
  listeners.add(listener);
  listener(onlineIds);
  return () => {
    listeners.delete(listener);
  };
}

export async function stopPresence(): Promise<void> {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  if (channel) {
    try {
      await channel.untrack();
    } catch {
      // ignore
    }
    await supabase.removeChannel(channel);
    channel = null;
  }
  starting = null;
  myUserId = null;
  onlineIds = [];
  emit();
}

export function startPresence(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (starting) return starting;

  starting = (async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    if (!uid) {
      starting = null;
      return;
    }
    if (channel) return;

    myUserId = uid;
    const ch = supabase.channel(PRESENCE_TOPIC, {
      config: { presence: { key: uid } },
    });
    channel = ch;

    ch.on("presence", { event: "sync" }, syncFromChannel)
      .on("presence", { event: "join" }, syncFromChannel)
      .on("presence", { event: "leave" }, syncFromChannel)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        try {
          await ch.track({ user_id: uid, online_at: new Date().toISOString() });
          syncFromChannel();
          void touchLastSeen();
        } catch (err) {
          if (import.meta.env.DEV) console.error("[Presence] track error:", err);
        }
      });

    if (!heartbeat) {
      heartbeat = setInterval(() => {
        void touchLastSeen();
      }, HEARTBEAT_MS);
    }

    window.addEventListener("beforeunload", () => {
      try {
        void ch.untrack();
      } catch {
        // ignore
      }
    });
  })().catch((err) => {
    starting = null;
    if (import.meta.env.DEV) console.warn("[Presence] indisponivel:", err);
  });

  return starting;
}

// Keep presence in sync with auth transitions (login in another tab, logout…)
if (typeof window !== "undefined") {
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void stopPresence();
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void startPresence();
      }
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[Presence] indisponivel:", err);
  }
}
