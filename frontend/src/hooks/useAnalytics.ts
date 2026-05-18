import { useQuery } from "@tanstack/react-query"

import { getSystemAnalytics } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

/**
 * Fetch system analytics metrics with automatic polling.
 *
 * Returns CPU, memory, disk, network utilization, boot time,
 * and process count for the current server. Polls every 5 seconds
 * when the query is active.
 */
export function useAnalytics() {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["system-analytics", serverId],
    queryFn: () => getSystemAnalytics(serverId),
    refetchInterval: 5000,
    staleTime: 2000,
  })
}
