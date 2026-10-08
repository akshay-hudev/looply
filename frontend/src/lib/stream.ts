import { useEffect, useState } from "react";

import { auth } from "./api";
import { AgentEvent } from "./types";

/** Live agent progress for a campaign via SSE, with polling fallback. */
export function useCampaignStream(campaignId: string | undefined, enabled: boolean) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId || !enabled) return;
    const url = `/api/campaigns/${campaignId}/stream?token=${encodeURIComponent(auth.token() || "")}` +
      `&org_id=${encodeURIComponent(auth.org() || "")}`;
    const es = new EventSource(url);
    es.addEventListener("agent", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as AgentEvent;
      setEvents((prev) => (prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev]));
    });
    es.addEventListener("status", (e) => setStatus(JSON.parse((e as MessageEvent).data).status));
    return () => es.close();
  }, [campaignId, enabled]);

  return { events, status };
}
