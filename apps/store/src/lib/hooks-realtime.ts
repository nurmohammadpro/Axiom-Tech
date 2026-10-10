import { useEffect, useState } from "react";

interface RealtimeOptions {
  enabled?: boolean;
  interval?: number;
  channel?: string;
}

export function useRealtimeUpdates<T>(
  fetchFn: () => Promise<T>,
  options: RealtimeOptions = {}
) {
  const { enabled = true, interval = 5000, channel = "default" } = options;
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    let intervalId: NodeJS.Timeout;

    const fetch = async () => {
      try {
        const result = await fetchFn();
        if (mounted) {
          setData(result);
          setIsConnected(true);
          setLastUpdate(new Date());
        }
      } catch (error) {
        console.error("Realtime fetch error:", error);
        if (mounted) setIsConnected(false);
      }
    };

    fetch();
    intervalId = setInterval(fetch, interval);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [fetchFn, enabled, interval, channel]);

  return { data, isConnected, lastUpdate };
}
