import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import type { BenchSummary } from "@/lib/api"
import { createBenchSocket, type BenchStatusEvent } from "@/lib/ws"

/**
 * Maintains a single WebSocket subscription to bench status broadcasts and merges
 * ``status`` / ``pid`` into the cached ``["benches"]`` list without replacing entries.
 */
export function useBenchSocket() {
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  const [connected, setConnected] = useState(false)
  const disconnectRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const disconnect = createBenchSocket({
      onMessage: (event: BenchStatusEvent) => {
        queryClientRef.current.setQueryData<BenchSummary[]>(["benches"], (old) => {
          if (old === undefined) {
            return old
          }
          const byName = new Map(old.map((b) => [b.name, { ...b }]))
          let hasUnknown = false
          for (const row of event.benches) {
            const existing = byName.get(row.name)
            if (existing !== undefined) {
              existing.status = row.status
              existing.pid = row.pid
            } else {
              hasUnknown = true
            }
          }
          if (hasUnknown) {
            void queryClientRef.current.invalidateQueries({ queryKey: ["benches"] })
          }
          return Array.from(byName.values())
        })
      },
      onConnectionChange: setConnected,
    })
    disconnectRef.current = disconnect
    return () => {
      if (disconnectRef.current !== null) {
        disconnectRef.current()
        disconnectRef.current = null
      }
    }
  }, [])

  return { connected }
}
