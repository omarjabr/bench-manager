import { useQuery } from "@tanstack/react-query"

import { getSiteDatabaseStatus, getScopedTables, siteDbScope } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

/**
 * Probe the MariaDB connection for a specific Frappe site.
 */
export function useSiteDatabaseStatus(benchName: string, siteName: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["site-database", "status", benchName, siteName, serverId],
    queryFn: () => getSiteDatabaseStatus(benchName, siteName, serverId),
    staleTime: 30_000,
    enabled: benchName.length > 0 && siteName.length > 0,
  })
}

/**
 * List tables in a site's database.  Derives the ``apiScope`` from the
 * bench + site pair so callers don't have to construct it manually.
 */
export function useSiteDatabaseTables(benchName: string, siteName: string) {
  const serverId = useUiStore((s) => s.currentServerId)
  const scope = benchName && siteName ? siteDbScope(benchName, siteName) : ""

  return useQuery({
    queryKey: ["site-database", "tables", benchName, siteName, serverId],
    queryFn: () => getScopedTables(scope, serverId),
    staleTime: 60_000,
    enabled: scope.length > 0,
  })
}
