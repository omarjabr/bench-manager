import { useQuery } from "@tanstack/react-query"

import {
  getDatabaseStatus,
  getDatabases,
  getScopedTables,
  getScopedTableColumns,
  getScopedTableRows,
} from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

export function useDatabaseStatus() {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["database", "status", serverId],
    queryFn: () => getDatabaseStatus(serverId),
    staleTime: 30_000,
  })
}

export function useDatabases() {
  const serverId = useUiStore((s) => s.currentServerId)
  const { data: status } = useDatabaseStatus()

  return useQuery({
    queryKey: ["database", "databases", serverId],
    queryFn: () => getDatabases(serverId),
    staleTime: 60_000,
    enabled: status?.connected === true,
  })
}

/**
 * List tables for a given ``apiScope`` (e.g. ``/api/database/mydb`` or a
 * per-site scope).  The scope is included in the query key so caches stay
 * independent.
 */
export function useScopedTables(apiScope: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["database", "tables", apiScope, serverId],
    queryFn: () => getScopedTables(apiScope, serverId),
    staleTime: 60_000,
    enabled: apiScope.length > 0,
  })
}

export function useScopedTableColumns(apiScope: string, tableName: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["database", "columns", apiScope, tableName, serverId],
    queryFn: () => getScopedTableColumns(apiScope, tableName, serverId),
    staleTime: 60_000,
    enabled: apiScope.length > 0 && tableName.length > 0,
  })
}

export function useScopedTableRows(
  apiScope: string,
  tableName: string,
  page: number
) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["database", "rows", apiScope, tableName, page, serverId],
    queryFn: () => getScopedTableRows(apiScope, tableName, page, 25, serverId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    enabled: apiScope.length > 0 && tableName.length > 0,
  })
}
