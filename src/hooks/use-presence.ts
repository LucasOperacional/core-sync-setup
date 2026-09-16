import { useEffect, useState } from "react";
import { getOnlineUsers, startPresence, subscribeOnlineUsers } from "@/lib/presence";

/** Marks the current user online app-wide and returns the online user ids. */
export function usePresence(): string[] {
  const [onlineUsers, setOnlineUsers] = useState<string[]>(getOnlineUsers);

  useEffect(() => {
    void startPresence();
    return subscribeOnlineUsers(setOnlineUsers);
  }, []);

  return onlineUsers;
}
