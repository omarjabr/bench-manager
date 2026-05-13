import { useQuery } from "@tanstack/react-query"

import { getSiteLogFiles, getSiteLogTail } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

/**
 * Fetch the list of log files available for a site's bench.
 */
export function useSiteLogFiles(benchName: string, siteName: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["site-logs", "files", benchName, siteName, serverId],
    queryFn: () => getSiteLogFiles(benchName, siteName, serverId),
    enabled: benchName.length > 0 && siteName.length > 0,
    staleTime: 15_000,
  })
}

/**
 * Fetch the last N lines of a specific log file.
 */
export function useSiteLogTail(
  benchName: string,
  siteName: string,
  filename: string,
  tail = 500,
) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["site-logs", "tail", benchName, siteName, filename, tail, serverId],
    queryFn: () => getSiteLogTail(benchName, siteName, filename, tail, serverId),
    enabled:
      benchName.length > 0 && siteName.length > 0 && filename.length > 0,
    staleTime: 5_000,
  })
}
