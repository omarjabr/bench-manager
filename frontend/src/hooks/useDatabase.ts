import { useQuery } from "@tanstack/react-query"

import {
  getDatabaseStatus,
  getDatabases,
  getDatabaseTables,
  getTableColumns,
  getTableRows,
} from "@/lib/api"

export function useDatabaseStatus() {
  return useQuery({
    queryKey: ["database", "status"],
    queryFn: getDatabaseStatus,
    staleTime: 30_000,
  })
}

export function useDatabases() {
  const { data: status } = useDatabaseStatus()
  return useQuery({
    queryKey: ["database", "databases"],
    queryFn: getDatabases,
    staleTime: 60_000,
    enabled: status?.connected === true,
  })
}

export function useDatabaseTables(dbName: string) {
  return useQuery({
    queryKey: ["database", "tables", dbName],
    queryFn: () => getDatabaseTables(dbName),
    staleTime: 60_000,
    enabled: dbName.length > 0,
  })
}

export function useTableColumns(dbName: string, tableName: string) {
  return useQuery({
    queryKey: ["database", "columns", dbName, tableName],
    queryFn: () => getTableColumns(dbName, tableName),
    staleTime: 60_000,
    enabled: dbName.length > 0 && tableName.length > 0,
  })
}

export function useTableRows(dbName: string, tableName: string, page: number) {
  return useQuery({
    queryKey: ["database", "rows", dbName, tableName, page],
    queryFn: () => getTableRows(dbName, tableName, page, 25),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    enabled: dbName.length > 0 && tableName.length > 0,
  })
}
